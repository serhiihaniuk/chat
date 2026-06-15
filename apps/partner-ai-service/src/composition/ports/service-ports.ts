import type {
  AgentRuntimePort,
  AssistantTurnLifecyclePort,
  ClockPort,
  ContextManagerPort,
  ConversationRepositoryPort,
  HostCapabilityManifestPort,
  IdGeneratorPort,
  MemoryPort,
  ObservabilitySinkPort,
  PolicyPort,
  StreamChatPorts,
  TurnGuardRegistryPort,
  TurnPolicyResolverPort,
} from "@side-chat/partner-ai-core";

export type ServicePortsOptions = {
  readonly conversations: ConversationRepositoryPort;
  readonly assistantTurns: AssistantTurnLifecyclePort;
  readonly hostCapabilities: HostCapabilityManifestPort;
  readonly turnPolicies: TurnPolicyResolverPort;
  readonly turnGuards: TurnGuardRegistryPort;
  readonly contextManager: ContextManagerPort;
  readonly memory: MemoryPort;
  readonly runtime: AgentRuntimePort;
  readonly clock?: ClockPort | undefined;
  readonly ids?: IdGeneratorPort | undefined;
  readonly policies: PolicyPort;
  readonly observability?: ObservabilitySinkPort | undefined;
};

export const createServicePorts = (options: ServicePortsOptions): StreamChatPorts => ({
  conversations: options.conversations,
  assistantTurns: options.assistantTurns,
  hostCapabilities: options.hostCapabilities,
  turnPolicies: options.turnPolicies,
  turnGuards: options.turnGuards,
  contextManager: options.contextManager,
  memory: options.memory,
  runtime: options.runtime,
  clock: options.clock ?? systemClock,
  ids: options.ids ?? randomIds,
  policies: options.policies,
  observability: options.observability,
});

const systemClock: ClockPort = {
  now: () => new Date().toISOString(),
};

const randomIds: IdGeneratorPort = {
  nextConversationId: () => `conversation_${crypto.randomUUID()}`,
  nextEventId: () => `event_${crypto.randomUUID()}`,
};
