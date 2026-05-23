import {
  BackendCoreError,
  createStreamChatUseCase,
  type AssistantRuntimePort,
  type AuthContext,
  type AuthorityInput,
  type AuthorityPort,
  type ClockPort,
  type ConversationRepositoryPort,
  type IdGeneratorPort,
  type RuntimeEvent,
  type WorkspaceRef,
} from "@side-chat/backend-core";
import {
  ProtocolValidationError,
  encodeSseEvent,
  parseChatStreamRequest,
  type ChatStreamRequest,
  type ProtocolErrorCode,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import {
  createMemorySidechatRepositories,
  type SidechatRepositories,
} from "@side-chat/db";
import { Hono } from "hono";
import { createServicePersistence } from "../persistence/service-persistence.js";

const DEFAULT_WORKSPACE: WorkspaceRef = {
  tenantId: "tenant_local",
  workspaceId: "workspace_local",
};

const DEFAULT_PROVIDER_ID = "fake";
const DEFAULT_MODEL_ID = "fake-echo";

export type PartnerAiServiceOptions = {
  readonly repositories?: SidechatRepositories;
};

export const createPartnerAiServiceApp = (
  options: PartnerAiServiceOptions = {},
) => {
  const app = new Hono();
  const repositories =
    options.repositories ?? createMemorySidechatRepositories();

  app.post("/chat/stream", async (context) => {
    const persistence = createServicePersistence(repositories);
    const parsed = await parseJsonBody(context.req.raw);
    if (!parsed.ok) return jsonError("bad_request", parsed.message, 400);

    let chatRequest: ChatStreamRequest;
    try {
      chatRequest = parseChatStreamRequest(parsed.value);
    } catch (error) {
      return jsonError("bad_request", errorMessage(error), 400);
    }

    const authInput = toAuthorityInput(context.req.raw, chatRequest);
    const useCase = createStreamChatUseCase(
      createFakeServicePorts(persistence.conversations),
    );

    try {
      const events: SidechatStreamEvent[] = [];
      for await (const event of useCase.stream({
        workspace: DEFAULT_WORKSPACE,
        request: chatRequest,
        authority: authInput,
        providerId: DEFAULT_PROVIDER_ID,
        modelId: DEFAULT_MODEL_ID,
      })) {
        events.push(event);
      }
      await persistence.persistStreamResult({
        request: chatRequest,
        providerId: DEFAULT_PROVIDER_ID,
        modelId: DEFAULT_MODEL_ID,
        events,
      });

      return new Response(events.map(encodeSseEvent).join(""), {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "x-request-id": chatRequest.requestId,
        },
      });
    } catch (error) {
      return mapServiceError(error);
    }
  });

  return app;
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

const toAuthorityInput = (
  request: Request,
  chatRequest: ChatStreamRequest,
): AuthorityInput => {
  const authorization = request.headers.get("authorization") ?? undefined;
  return {
    requestId: chatRequest.requestId,
    ...(authorization ? { bearerToken: authorization } : {}),
    ...(chatRequest.hostContext
      ? { hostContext: chatRequest.hostContext }
      : {}),
  };
};

const mapServiceError = (error: unknown): Response => {
  if (error instanceof BackendCoreError) {
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

const jsonError = (
  code: ProtocolErrorCode,
  message: string,
  status: number,
  retryable = false,
): Response =>
  Response.json(
    { protocolVersion: "sidechat.v1", code, message, retryable },
    { status },
  );

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unexpected service error.";

const createFakeServicePorts = (conversations: ConversationRepositoryPort) => ({
  authority: createHeaderAuthorityPort(),
  conversations,
  runtime: createFakeRuntimePort(),
  clock: createFixedClock(),
  ids: createDeterministicIds(),
});

const createHeaderAuthorityPort = (): AuthorityPort => ({
  resolveAuthContext: (input) =>
    Promise.resolve(
      input.bearerToken === "Bearer local-test-token"
        ? createLocalAuthContext(input)
        : undefined,
    ),
});

const createLocalAuthContext = (input: AuthorityInput): AuthContext => ({
  ...DEFAULT_WORKSPACE,
  subject: { subjectId: "subject_local", userId: "user_local" },
  actor: { subjectId: "subject_local", userId: "user_local" },
  roles: ["member"],
  scopes: ["conversation:read", "conversation:write", "message:write"],
  source: "test_authority",
  ...(input.hostContext?.origin
    ? { hostOrigin: input.hostContext.origin }
    : {}),
  issuedAt: "2026-05-23T13:00:00.000Z",
});

const createFakeRuntimePort = (): AssistantRuntimePort => ({
  stream: async function* (request) {
    await Promise.resolve();
    yield runtimeEvent({
      type: "runtime.reasoning",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence: 0,
      summary: "service fake runtime selected deterministic response",
    });
    yield runtimeEvent({
      type: "runtime.output_delta",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence: 1,
      content: `Fake response: ${request.messages.at(-1)?.content ?? ""}`,
    });
    yield runtimeEvent({
      type: "runtime.completed",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence: 2,
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 3, totalTokens: 4 },
    });
  },
});

const runtimeEvent = (event: RuntimeEvent): RuntimeEvent => event;

const createFixedClock = (): ClockPort => ({
  now: () => "2026-05-23T13:00:00.000Z",
});

const createDeterministicIds = (): IdGeneratorPort => {
  let eventIndex = 0;
  return {
    nextConversationId: () => "conversation_local",
    nextAssistantTurnId: () => "assistant_turn_local",
    nextEventId: () => {
      eventIndex += 1;
      return `event_${eventIndex.toString().padStart(3, "0")}`;
    },
  };
};

export type PartnerAiServiceApp = ReturnType<typeof createPartnerAiServiceApp>;
