import {
  SIDECHAT_EVENT_TYPES,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import {
  assertWorkspaceAuthority,
  type AuthContext,
  type WorkspaceRef,
} from "#domain/authority";
import { mapAuthorityDenialToError } from "#errors";
import {
  createRequestCorrelation,
  type ObservabilitySinkPort,
} from "#services/observability";
import {
  allowRequestPolicy,
  mapPolicyDenialToError,
  type PolicyPort,
} from "#policies/policy";
import {
  recordStreamObservation,
  runtimeEventAttributes,
  terminalErrorCode,
} from "#services/stream-observability";
import type {
  AgentRuntimePort,
  ClockPort,
  ConversationRepositoryPort,
  IdGeneratorPort,
} from "#ports";
import {
  createErrorEvent,
  mapRuntimeEvent,
  mapUnknownRuntimeError,
  validateExactlyOneTerminal,
} from "./runtime-event-mapper.js";

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

    let nextStreamSequence = 1;
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
        const event = mapRuntimeEvent(
          runtimeEvent,
          input.request,
          ports,
          nextStreamSequence,
        );
        if (event) {
          yield emit(event);
          nextStreamSequence += 1;
        }
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
          nextStreamSequence,
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
