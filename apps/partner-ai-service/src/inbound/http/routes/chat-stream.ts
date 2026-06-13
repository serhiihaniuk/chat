import {
  PartnerAiCoreError,
  createPartnerAiCoreLayer,
  streamChatEffect,
} from "@side-chat/partner-ai-core";
import {
  PROTOCOL_ERROR_CODES,
  ProtocolValidationError,
  parseChatStreamRequest,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { Stream } from "effect";
import type { Hono } from "hono";

import { createServicePersistence } from "#adapters/persistence/service-persistence";
import { createServicePorts } from "#composition/service-ports";
import type { AuthContextVariables } from "../middleware/auth-context.js";
import {
  errorMessage,
  httpStatusForProtocolError,
  jsonError,
} from "../response/protocol-errors.js";
import { streamingSseResponse } from "../response/sse.js";
import { requireContextAuth, type RouteDependencies } from "./types.js";

export const registerChatStreamRoute = (
  app: Hono<AuthContextVariables>,
  dependencies: RouteDependencies,
) => {
  app.post("/chat/stream", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const persistence = createServicePersistence(dependencies.repositories);
    const parsed = await parseJsonBody(context.req.raw);
    if (!parsed.ok) return jsonError(PROTOCOL_ERROR_CODES.BAD_REQUEST, parsed.message, 400);

    let chatRequest: ChatStreamRequest;
    try {
      chatRequest = parseChatStreamRequest(parsed.value);
    } catch (error) {
      return jsonError(PROTOCOL_ERROR_CODES.BAD_REQUEST, errorMessage(error), 400);
    }

    const coreLayer = createPartnerAiCoreLayer(
      createServicePorts({
        conversations: persistence.conversations,
        assistantTurns: persistence.assistantTurns,
        hostCapabilities: dependencies.hostCapabilities,
        turnPolicies: dependencies.turnPolicies,
        turnGuards: dependencies.turnGuards,
        contextManager: dependencies.contextManager,
        memory: dependencies.memory,
        runtime: dependencies.runtime,
        ...(dependencies.observability ? { observability: dependencies.observability } : {}),
        policies: dependencies.policies,
      }),
    );

    try {
      const eventIterator = Stream.toAsyncIterable(
        streamChatEffect({
          workspace: dependencies.workspace,
          hostAppId: dependencies.hostAppId,
          request: chatRequest,
          authContext,
          abortSignal: context.req.raw.signal,
          ...traceInput(context.req.raw),
        }).pipe(Stream.provide(coreLayer)),
      )[Symbol.asyncIterator]();
      const firstEvent = await eventIterator.next();

      return streamingSseResponse({
        events: prependFirstEvent(firstEvent, eventIterator),
        requestId: chatRequest.requestId,
      });
    } catch (error) {
      return mapServiceError(error);
    }
  });
};

const prependFirstEvent = async function* (
  firstEvent: IteratorResult<SidechatStreamEvent>,
  events: AsyncIterator<SidechatStreamEvent>,
): AsyncIterable<SidechatStreamEvent> {
  if (!firstEvent.done) yield firstEvent.value;

  while (true) {
    const nextEvent = await events.next();
    if (nextEvent.done) return;
    yield nextEvent.value;
  }
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

const traceInput = (request: Request): { readonly traceId?: string } => {
  const traceId = request.headers.get("x-trace-id") ?? undefined;
  return traceId ? { traceId } : {};
};

const mapServiceError = (error: unknown): Response => {
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
