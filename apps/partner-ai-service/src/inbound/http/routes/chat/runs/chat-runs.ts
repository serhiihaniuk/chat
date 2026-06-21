import { PartnerAiCoreError } from "@side-chat/partner-ai-core";
import {
  PROTOCOL_ERROR_CODES,
  ProtocolValidationError,
  SIDECHAT_PROTOCOL_VERSION,
  parseChatStreamRequest,
  type ChatStreamRequest,
} from "@side-chat/chat-protocol";
import type { Hono } from "hono";

import type { TurnRunner } from "#inbound/turn-runner/turn-runner";
import type { AuthContextVariables } from "../../../middleware/auth-context.js";
import {
  errorMessage,
  httpStatusForProtocolError,
  jsonError,
} from "../../../response/protocol-errors.js";
import { requireContextAuth } from "../../types.js";

export type ChatRunsRouteDependencies = {
  readonly turnRunner: TurnRunner;
};

/**
 * Add POST /chat/runs.
 *
 * This route accepts an assistant turn and hands it to the server-owned runner:
 * pre-start runs synchronously, then generation is forked off the request and
 * runs to a durable terminal regardless of this connection. The response is JSON
 * (never SSE) carrying the turn identity a client later streams or cancels by.
 *
 * Pre-start failures become JSON errors here, matching the assistant-turn failure
 * split: setup is rejected as a request/core error because the browser never saw
 * `sidechat.started`.
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

    try {
      const started = await dependencies.turnRunner.start({
        request: chatRequest,
        authContext,
        ...traceInput(context.req.raw),
      });
      return context.json({ protocolVersion: SIDECHAT_PROTOCOL_VERSION, ...started });
    } catch (error) {
      return mapPreStartError(error);
    }
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
 * outcomes travel through the durable event log, not this response.
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
