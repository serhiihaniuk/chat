import type {
  AgentRuntimePort,
  AssistantTurnLifecyclePort,
  ClockPort,
  ContextManagerPort,
  ConversationRepositoryPort,
  HostCapabilityManifestPort,
  IdGeneratorPort,
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
  readonly runtime: AgentRuntimePort;
  readonly clock?: ClockPort;
  readonly ids?: IdGeneratorPort;
  readonly policies: PolicyPort;
  readonly observability?: ObservabilitySinkPort;
};

export const createServicePorts = (options: ServicePortsOptions): StreamChatPorts => ({
  conversations: options.conversations,
  assistantTurns: options.assistantTurns,
  hostCapabilities: options.hostCapabilities,
  turnPolicies: options.turnPolicies,
  turnGuards: options.turnGuards,
  contextManager: options.contextManager,
  runtime: options.runtime,
  clock: options.clock ?? systemClock,
  ids: options.ids ?? randomIds,
  policies: options.policies,
  ...(options.observability ? { observability: options.observability } : {}),
});

const systemClock: ClockPort = {
  now: () => new Date().toISOString(),
};

const randomIds: IdGeneratorPort = {
  nextConversationId: () => `conversation_${crypto.randomUUID()}`,
  nextEventId: () => `event_${crypto.randomUUID()}`,
};
