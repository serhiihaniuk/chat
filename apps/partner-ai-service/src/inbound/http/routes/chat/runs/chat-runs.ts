import { PartnerAiCoreError, type AuthContext } from "@side-chat/partner-ai-core";
import {
  PROTOCOL_ERROR_CODES,
  ProtocolValidationError,
  parseChatStreamRequest,
  type ChatStreamRequest,
  type ProtocolErrorCode,
} from "@side-chat/chat-protocol";
import type { DiagnosticLogger } from "@side-chat/shared";
import type { Hono } from "hono";

import type { StartedTurn, TurnRunner } from "#inbound/turn-runner/turn-runner";
import type { AuthContextVariables } from "../../../middleware/auth-context.js";
import {
  errorMessage,
  httpStatusForProtocolError,
  jsonError,
  notStreamOwnerError,
  replayExpiredError,
} from "../../../response/protocol-errors.js";
import { requireContextAuth } from "../../types.js";
import { openTurnEventStream, type TurnStreamDependencies } from "../turn-stream-response.js";

/** Replay the whole turn from `sidechat.started`; the POST caller has seen nothing yet. */
const REPLAY_FROM_START = -1;

export type ChatRunsRouteDependencies = TurnStreamDependencies & {
  readonly turnRunner: TurnRunner;
  readonly logger: DiagnosticLogger;
};

/**
 * Start a turn and stream it on the same POST connection.
 *
 * Setup runs before `sidechat.started`, so setup failures are JSON responses.
 * After acceptance, generation runs in the server-owned runner and this response
 * sends the turn's SSE events from the beginning. Binding the stream to the
 * starting connection keeps it on the owning instance without sticky routing
 * (ADR 0007). The first event carries the turn identity.
 *
 * Closing the response releases the subscriber but does not stop generation.
 * The status route recovers a lost identity, and the stream route resumes later
 * from its saved cursor.
 *
 * Source: the accepted turn and its server-owned event stream. Target: the
 * browser's SSE response. Invariant: closing the response never stops the turn.
 */
export const registerChatRunsRoute = (
  app: Hono<AuthContextVariables>,
  dependencies: ChatRunsRouteDependencies,
) => {
  app.post("/chat/runs", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const parsed = await parseJsonBody(context.req.raw);
    if (!parsed.ok) return jsonError(PROTOCOL_ERROR_CODES.BAD_REQUEST, parsed.message, 400);

    let chatRequest: ChatStreamRequest;
    try {
      chatRequest = parseChatStreamRequest(parsed.value);
    } catch (error) {
      return jsonError(PROTOCOL_ERROR_CODES.BAD_REQUEST, errorMessage(error), 400);
    }

    let started: StartedTurn;
    try {
      started = await dependencies.turnRunner.start({
        request: chatRequest,
        authContext,
        ...traceInput(context.req.raw),
      });
    } catch (error) {
      return mapPreStartError(error, chatRequest.requestId, dependencies.logger);
    }

    return streamStartedTurn(dependencies, authContext, started);
  });
};

/**
 * Stream an accepted turn, including idempotent replays.
 *
 * A new turn is registered before the response subscribes because its first
 * event may already be arriving. A repeated request id reuses the existing turn
 * and never starts a second generation. If this instance has no event buffer,
 * fail before sending SSE: a finished turn is `replay_expired`, while a running
 * turn owned elsewhere is `stream_unavailable`.
 *
 * Source: the accepted turn and its request id. Target: this instance's SSE
 * subscriber. Invariant: one request id never starts two generations.
 */
const streamStartedTurn = (
  dependencies: ChatRunsRouteDependencies,
  authContext: AuthContext,
  started: StartedTurn,
): Response => {
  const finished = started.status !== "running";
  if (started.inserted) {
    dependencies.dispatcher.registerTurn(started.assistantTurnId);
  } else if (!dependencies.dispatcher.hasTurn(started.assistantTurnId)) {
    if (!finished) {
      return notStreamOwnerError(
        "Another instance owns this turn's live stream; poll turn status until it finishes.",
      );
    }
    return replayExpiredError("This turn has finished; read it from conversation history.");
  }

  return openTurnEventStream(dependencies, {
    assistantTurnId: started.assistantTurnId,
    requestId: started.requestId,
    authContext,
    after: REPLAY_FROM_START,
    // A replayed finished turn ends after its buffered replay; a live turn tails.
    replayOnly: finished,
  });
};

const parseJsonBody = async (
  request: Request,
): Promise<
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string }
> => {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }
};

const traceInput = (request: Request): { readonly traceId?: string | undefined } => {
  const traceId = request.headers.get("x-trace-id") ?? undefined;
  return { traceId: traceId === "" ? undefined : traceId };
};

/**
 * Map a pre-start failure to its JSON response.
 *
 * Only pre-start work can fail here: once generation is forked, terminal
 * outcomes travel through the turn's event stream, not this response.
 *
 * A 5xx body carries a generic message plus the request id — the real error
 * (which may include driver detail) goes only to the log, never the browser. A
 * 4xx message is client-actionable (bad request, unauthorized, conversation
 * busy), so it is safe to return verbatim.
 */
const mapPreStartError = (
  error: unknown,
  requestId: string,
  logger: DiagnosticLogger,
): Response => {
  if (error instanceof PartnerAiCoreError) {
    const status = httpStatusForProtocolError(error.protocolCode);
    if (status >= 500) {
      return internalError(error, requestId, logger, error.protocolCode, error.retryable);
    }
    return jsonError(error.protocolCode, error.message, status, error.retryable);
  }
  if (error instanceof ProtocolValidationError) {
    return jsonError(PROTOCOL_ERROR_CODES.BAD_REQUEST, error.message, 400);
  }
  // An unknown thrown value carries no honest retryable signal; default to true.
  return internalError(error, requestId, logger, PROTOCOL_ERROR_CODES.INTERNAL_ERROR, true);
};

const internalError = (
  error: unknown,
  requestId: string,
  logger: DiagnosticLogger,
  code: ProtocolErrorCode,
  retryable: boolean,
): Response => {
  logger.error("turn pre-start failed", { requestId, error: errorMessage(error) });
  return jsonError(
    code,
    `An internal error occurred (reference ${requestId}).`,
    httpStatusForProtocolError(code),
    retryable,
  );
};
