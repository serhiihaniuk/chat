import {
  SIDECHAT_EVENT_TYPES,
  validateSidechatEventSequence,
  type ChatStreamRequest,
  type ProtocolErrorCode,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import {
  assertWorkspaceAuthority,
  type AuthContext,
  type WorkspaceRef,
} from "../../domain/authority.js";
import {
  PartnerAiCoreError,
  mapAuthorityDenialToError,
} from "../../errors/index.js";
import {
  createRequestCorrelation,
  type ObservabilitySinkPort,
} from "../../services/observability.js";
import {
  allowRequestPolicy,
  mapPolicyDenialToError,
  type PolicyPort,
} from "../../policies/policy.js";
import {
  recordStreamObservation,
  runtimeEventAttributes,
  terminalErrorCode,
} from "../../services/stream-observability.js";
import type {
  AgentRuntimePort,
  ClockPort,
  ConversationRepositoryPort,
  IdGeneratorPort,
  RuntimeEvent,
} from "../../ports/index.js";

export type StreamChatInput = {
  readonly workspace: WorkspaceRef;
  readonly request: ChatStreamRequest;
  readonly authContext: AuthContext | undefined;
  readonly providerId: string;
  readonly modelId: string;
  readonly traceId?: string;
};

export type StreamChatUseCase = {
  readonly stream: (
    input: StreamChatInput,
  ) => AsyncIterable<SidechatStreamEvent>;
};

export type StreamChatUseCasePorts = {
  readonly conversations: ConversationRepositoryPort;
  readonly runtime: AgentRuntimePort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly policies?: PolicyPort;
  readonly observability?: ObservabilitySinkPort;
};

export const createStreamChatUseCase = (
  ports: StreamChatUseCasePorts,
): StreamChatUseCase => ({
  async *stream(input) {
    const authContext = await resolveAuthorizedContext(ports, input);
    const correlation = createRequestCorrelation({
      requestId: input.request.requestId,
      ...(input.traceId ? { traceId: input.traceId } : {}),
    });
    const startedAt = ports.clock.now();
    await recordStreamObservation(ports.observability, {
      correlation,
      lifecycleState: "received",
      startedAt,
      now: startedAt,
      attributes: {
        requestId: input.request.requestId,
        message: input.request.message,
        authSource: authContext.source,
        subjectId: authContext.subject.subjectId,
      },
    });

    const conversation = await ports.conversations.ensureConversation({
      authContext,
      ...(input.request.conversationId
        ? { requestedConversationId: input.request.conversationId }
        : {}),
      fallbackConversationId: ports.ids.nextConversationId(),
    });
    const conversationDecision = assertWorkspaceAuthority(
      authContext,
      conversation,
    );
    if (!conversationDecision.allowed) {
      throw mapAuthorityDenialToError(
        conversationDecision.code,
        conversationDecision.message,
      );
    }

    await ports.conversations.appendUserMessage({
      authContext,
      conversationId: conversation.conversationId,
      message: input.request.message,
    });

    const assistantTurnId = ports.ids.nextAssistantTurnId();
    const emitted: SidechatStreamEvent[] = [];
    await recordStreamObservation(ports.observability, {
      correlation,
      lifecycleState: "started",
      assistantTurnId,
      providerId: input.providerId,
      modelId: input.modelId,
      startedAt,
      now: ports.clock.now(),
      attributes: {
        requestId: input.request.requestId,
        assistantTurnId,
        providerId: input.providerId,
        modelId: input.modelId,
        prompt: input.request.message.content,
      },
    });

    const emit = (event: SidechatStreamEvent): SidechatStreamEvent => {
      emitted.push(event);
      return event;
    };

    yield emit({
      protocolVersion: input.request.protocolVersion,
      type: SIDECHAT_EVENT_TYPES.started,
      eventId: ports.ids.nextEventId(),
      assistantTurnId,
      sequence: 0,
      createdAt: ports.clock.now(),
      conversationId: conversation.conversationId,
    });

    try {
      for await (const runtimeEvent of ports.runtime.stream({
        requestId: input.request.requestId,
        assistantTurnId,
        providerId: input.providerId,
        modelId: input.modelId,
        messages: [input.request.message],
      })) {
        await recordStreamObservation(ports.observability, {
          correlation,
          lifecycleState: "runtime_event",
          assistantTurnId,
          providerId: input.providerId,
          modelId: input.modelId,
          startedAt,
          now: ports.clock.now(),
          attributes: runtimeEventAttributes(runtimeEvent),
        });
        const event = mapRuntimeEvent(runtimeEvent, input.request, ports);
        if (event) yield emit(event);
      }
    } catch (error) {
      const mappedError = mapUnknownRuntimeError(error);
      await recordStreamObservation(ports.observability, {
        correlation,
        lifecycleState: "failed",
        assistantTurnId,
        providerId: input.providerId,
        modelId: input.modelId,
        errorCode: mappedError.protocolCode,
        startedAt,
        now: ports.clock.now(),
        attributes: {
          errorCode: mappedError.protocolCode,
          message: mappedError.message,
        },
      });
      yield emit(
        createErrorEvent(
          input,
          assistantTurnId,
          emitted.length,
          ports,
          mappedError,
        ),
      );
    }

    const terminalCode = terminalErrorCode(emitted);
    await recordStreamObservation(ports.observability, {
      correlation,
      lifecycleState: terminalCode ? "failed" : "completed",
      assistantTurnId,
      providerId: input.providerId,
      modelId: input.modelId,
      ...(terminalCode ? { errorCode: terminalCode } : {}),
      startedAt,
      now: ports.clock.now(),
      attributes: { eventCount: emitted.length },
    });

    validateExactlyOneTerminal(emitted);
  },
});

const resolveAuthorizedContext = async (
  ports: StreamChatUseCasePorts,
  input: StreamChatInput,
): Promise<AuthContext> => {
  const authorityDecision = assertWorkspaceAuthority(
    input.authContext,
    input.workspace,
  );
  if (!authorityDecision.allowed) {
    throw mapAuthorityDenialToError(
      authorityDecision.code,
      authorityDecision.message,
    );
  }

  const policyDecision = await (
    ports.policies ?? allowRequestPolicy()
  ).evaluate({
    authContext: authorityDecision.authContext,
    workspace: input.workspace,
    request: input.request,
    providerId: input.providerId,
    modelId: input.modelId,
  });
  if (!policyDecision.allowed) {
    throw mapPolicyDenialToError(policyDecision);
  }

  return authorityDecision.authContext;
};

const mapRuntimeEvent = (
  event: RuntimeEvent,
  request: ChatStreamRequest,
  ports: Pick<StreamChatUseCasePorts, "clock" | "ids">,
): SidechatStreamEvent | undefined => {
  const base = {
    protocolVersion: request.protocolVersion,
    eventId: ports.ids.nextEventId(),
    assistantTurnId: event.assistantTurnId,
    sequence: event.sequence + 1,
    createdAt: ports.clock.now(),
  } as const;

  switch (event.type) {
    case "runtime.started":
      return undefined;
    case "runtime.output_delta":
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.delta,
        content: event.content,
      };
    case "runtime.reasoning":
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.reasoning,
        summary: event.summary,
      };
    case "runtime.tool_call":
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.tool,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: "started",
      };
    case "runtime.tool_result":
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.tool,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: event.status,
        ...(event.resultJson ? { result: event.resultJson } : {}),
        ...(event.errorCode ? { errorCode: "tool_failed" } : {}),
      };
    case "runtime.completed":
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.completed,
        finishReason: event.finishReason,
        ...(event.usage ? { usage: event.usage } : {}),
      };
    case "runtime.error":
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.error,
        code: mapRuntimeErrorCode(event.code),
        message: event.message,
        retryable: event.retryable,
      };
  }
};

const createErrorEvent = (
  input: StreamChatInput,
  assistantTurnId: string,
  sequence: number,
  ports: Pick<StreamChatUseCasePorts, "clock" | "ids">,
  error: Pick<PartnerAiCoreError, "protocolCode" | "message" | "retryable">,
): SidechatStreamEvent => ({
  protocolVersion: input.request.protocolVersion,
  type: SIDECHAT_EVENT_TYPES.error,
  eventId: ports.ids.nextEventId(),
  assistantTurnId,
  sequence,
  createdAt: ports.clock.now(),
  code: error.protocolCode,
  message: error.message,
  retryable: error.retryable,
});

const mapUnknownRuntimeError = (error: unknown): PartnerAiCoreError =>
  error instanceof PartnerAiCoreError
    ? error
    : new PartnerAiCoreError(
        "runtime_failed",
        error instanceof Error ? error.message : "Runtime failed",
        "provider_failed",
        true,
      );

const mapRuntimeErrorCode = (code: string): ProtocolErrorCode => {
  if (code === "tool_failed") return "tool_failed";
  if (code === "timeout") return "timeout";
  if (code === "aborted") return "aborted";
  return "provider_failed";
};

const validateExactlyOneTerminal = (
  events: readonly SidechatStreamEvent[],
): void => {
  try {
    validateSidechatEventSequence(events);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid stream";
    throw new PartnerAiCoreError(
      "invalid_runtime_sequence",
      message,
      "malformed_stream",
    );
  }
};
