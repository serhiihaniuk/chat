import { PartnerAiCoreError, type AuthContext } from "@side-chat/partner-ai-core";
import {
  PROTOCOL_ERROR_CODES,
  ProtocolValidationError,
  parseChatStreamRequest,
  type ChatStreamRequest,
} from "@side-chat/chat-protocol";
import type { Hono } from "hono";

import type { StartedTurn, TurnRunner } from "#inbound/turn-runner/turn-runner";
import type { AuthContextVariables } from "../../../middleware/auth-context.js";
import {
  errorMessage,
  httpStatusForProtocolError,
  jsonError,
  replayExpiredError,
} from "../../../response/protocol-errors.js";
import { requireContextAuth } from "../../types.js";
import { openTurnEventStream, type TurnStreamDependencies } from "../turn-stream-response.js";

/** Replay the whole turn from `sidechat.started`; the POST caller has seen nothing yet. */
const REPLAY_FROM_START = -1;

export type ChatRunsRouteDependencies = TurnStreamDependencies & {
  readonly turnRunner: TurnRunner;
};

/**
 * Add POST /chat/runs — start a turn and stream it on the same connection.
 *
 * Pre-start runs synchronously, so setup failures are still JSON errors (the
 * browser never saw `sidechat.started`). Once the turn is accepted, generation is
 * forked onto the server-owned runner and this response becomes the turn's SSE
 * stream, replayed from the beginning. Binding the stream to the starting
 * connection is what makes it land on the owning instance with no sticky routing
 * (ADR 0007); `sidechat.started` at sequence 0 carries the turn identity
 * (`assistantTurnId` on the envelope, `conversationId` on the event).
 *
 * Closing this response releases one subscriber and never interrupts generation;
 * `GET /chat/runs/:requestId` recovers a lost identity, and the stream route
 * resumes from a cursor on the same instance.
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
      return mapPreStartError(error);
    }

    return streamStartedTurn(dependencies, authContext, started);
  });
};

/**
 * Stream an accepted turn, honoring idempotent replays.
 *
 * A fresh turn (`inserted`) is always live in this instance's registry, so it
 * streams unconditionally. A repeated `requestId` resolves to the existing turn
 * without forking a second generation; if that turn already finished and its
 * buffer was swept, fail closed as `replay_expired` before any SSE frame — the
 * caller reads the answer from conversation history instead.
 */
const streamStartedTurn = (
  dependencies: ChatRunsRouteDependencies,
  authContext: AuthContext,
  started: StartedTurn,
): Response => {
  const finished = started.status !== "running";
  if (!started.inserted && finished && !dependencies.dispatcher.hasTurn(started.assistantTurnId)) {
    return replayExpiredError("This turn has finished; read it from conversation history.");
  }

  return openTurnEventStream(dependencies, {
    assistantTurnId: started.assistantTurnId,
    requestId: started.requestId,
    authContext,
    after: REPLAY_FROM_START,
  });
};

const parseJsonBody = async (
  request: Request,
): Promise<
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string }
> => {
  try {
    return { ok: true, value: (await request.json()) as unknown };
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
 */
const mapPreStartError = (error: unknown): Response => {
  if (error instanceof PartnerAiCoreError) {
    return jsonError(
      error.protocolCode,
      error.message,
      httpStatusForProtocolError(error.protocolCode),
      error.retryable,
    );
  }
  if (error instanceof ProtocolValidationError) {
    return jsonError(PROTOCOL_ERROR_CODES.BAD_REQUEST, error.message, 400);
  }
  return jsonError(PROTOCOL_ERROR_CODES.INTERNAL_ERROR, errorMessage(error), 500, true);
};
