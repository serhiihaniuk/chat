import type {
  AgentRuntimePort,
  ClockPort,
  ConversationRepositoryPort,
  IdGeneratorPort,
  ObservabilitySinkPort,
  PolicyPort,
  RuntimeEvent,
} from "@side-chat/partner-ai-core";

export const createFakeServicePorts = ({
  conversations,
  observability,
  policies,
}: {
  readonly conversations: ConversationRepositoryPort;
  readonly observability?: ObservabilitySinkPort;
  readonly policies: PolicyPort;
}) => ({
  conversations,
  ...(observability ? { observability } : {}),
  policies,
  runtime: createFakeRuntimePort(),
  clock: createFixedClock(),
  ids: createDeterministicIds(),
});

const createFakeRuntimePort = (): AgentRuntimePort => ({
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
