import {
  DISABLED_CONVERSATION_TITLE_GENERATION,
  type AgentRuntimePort,
  type AssistantTurnLifecyclePort,
  type ClockPort,
  type ConversationTitleGenerationPort,
  type ContextManagerPort,
  type ConversationRepositoryPort,
  type HostCapabilityManifestPort,
  type IdGeneratorPort,
  type ObservabilitySinkPort,
  type PolicyPort,
  type StreamChatPorts,
  type TurnGuardRegistryPort,
  type TurnPolicyResolverPort,
} from "@side-chat/partner-ai-core";

export type ServicePortsOptions = {
  readonly conversations: ConversationRepositoryPort;
  readonly assistantTurns: AssistantTurnLifecyclePort;
  readonly hostCapabilities: HostCapabilityManifestPort;
  readonly turnPolicies: TurnPolicyResolverPort;
  readonly turnGuards: TurnGuardRegistryPort;
  readonly contextManager: ContextManagerPort;
  readonly runtime: AgentRuntimePort;
  readonly conversationTitleGeneration?: ConversationTitleGenerationPort | undefined;
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
  runtime: options.runtime,
  conversationTitleGeneration:
    options.conversationTitleGeneration ?? DISABLED_CONVERSATION_TITLE_GENERATION,
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
