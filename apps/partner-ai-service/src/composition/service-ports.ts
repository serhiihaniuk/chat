import type {
  AgentRuntimePort,
  ClockPort,
  ConversationRepositoryPort,
  IdGeneratorPort,
  ObservabilitySinkPort,
  PolicyPort,
  StreamChatUseCasePorts,
} from "@side-chat/partner-ai-core";

export type ServicePortsOptions = {
  readonly conversations: ConversationRepositoryPort;
  readonly runtime: AgentRuntimePort;
  readonly clock?: ClockPort;
  readonly ids?: IdGeneratorPort;
  readonly policies?: PolicyPort;
  readonly observability?: ObservabilitySinkPort;
};

export const createServicePorts = (options: ServicePortsOptions): StreamChatUseCasePorts => ({
  conversations: options.conversations,
  runtime: options.runtime,
  clock: options.clock ?? systemClock,
  ids: options.ids ?? randomIds,
  ...(options.policies ? { policies: options.policies } : {}),
  ...(options.observability ? { observability: options.observability } : {}),
});

const systemClock: ClockPort = {
  now: () => new Date().toISOString(),
};

const randomIds: IdGeneratorPort = {
  nextConversationId: () => "conversation_local",
  nextAssistantTurnId: () => `turn_${crypto.randomUUID()}`,
  nextEventId: () => `event_${crypto.randomUUID()}`,
};
