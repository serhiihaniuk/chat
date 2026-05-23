import {
  PartnerAiCoreError,
  createStreamChatUseCase,
} from "@side-chat/partner-ai-core";
import {
  ProtocolValidationError,
  parseChatStreamRequest,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import type { Hono } from "hono";

import { createServicePersistence } from "../../../adapters/persistence/service-persistence.js";
import { createFakeServicePorts } from "../../../composition/fake-service-ports.js";
import type { AuthContextVariables } from "../middleware/auth-context.js";
import { errorMessage, jsonError } from "../response/protocol-errors.js";
import { sseResponse } from "../response/sse.js";
import {
  DEFAULT_MODEL_ID,
  DEFAULT_PROVIDER_ID,
  requireContextAuth,
  type RouteDependencies,
} from "./types.js";

export const registerChatStreamRoute = (
  app: Hono<AuthContextVariables>,
  dependencies: RouteDependencies,
) => {
  app.post("/chat/stream", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const persistence = createServicePersistence(dependencies.repositories);
    const parsed = await parseJsonBody(context.req.raw);
    if (!parsed.ok) return jsonError("bad_request", parsed.message, 400);

    let chatRequest: ChatStreamRequest;
    try {
      chatRequest = parseChatStreamRequest(parsed.value);
    } catch (error) {
      return jsonError("bad_request", errorMessage(error), 400);
    }

    const useCase = createStreamChatUseCase(
      createFakeServicePorts({
        conversations: persistence.conversations,
        ...(dependencies.observability
          ? { observability: dependencies.observability }
          : {}),
        policies: dependencies.policies,
      }),
    );

    try {
      const events: SidechatStreamEvent[] = [];
      for await (const event of useCase.stream({
        workspace: dependencies.workspace,
        request: chatRequest,
        authContext,
        providerId: DEFAULT_PROVIDER_ID,
        modelId: DEFAULT_MODEL_ID,
        ...traceInput(context.req.raw),
      })) {
        events.push(event);
      }
      await persistence.persistStreamResult({
        request: chatRequest,
        providerId: DEFAULT_PROVIDER_ID,
        modelId: DEFAULT_MODEL_ID,
        events,
      });

      return sseResponse(events, chatRequest.requestId);
    } catch (error) {
      return mapServiceError(error);
    }
  });
};

const parseJsonBody = async (
  request: Request,
): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string }
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
    const status = error.protocolCode === "unauthorized" ? 401 : 403;
    return jsonError(
      error.protocolCode,
      error.message,
      status,
      error.retryable,
    );
  }
  if (error instanceof ProtocolValidationError) {
    return jsonError("bad_request", error.message, 400);
  }
  return jsonError("internal_error", errorMessage(error), 500, true);
};
