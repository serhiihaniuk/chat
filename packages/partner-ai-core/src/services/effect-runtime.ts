import { Context, Effect, Layer } from "effect";

import type { PolicyPort } from "#policies/policy";
import type {
  AgentRuntimePort,
  AssistantTurnLifecyclePort,
  ClockPort,
  ContextManagerPort,
  ConversationRepositoryPort,
  HostCapabilityManifestPort,
  IdGeneratorPort,
  MemoryPort,
  TurnGuardRegistryPort,
  TurnPolicyResolverPort,
} from "#ports";
import { NOOP_OBSERVABILITY_SINK, type ObservabilitySinkPort } from "./observability.js";

/**
 * A core assistant turn sees the host app through this capability menu.
 *
 * Each service names one job the host can perform for the workflow: persist
 * conversation and assistant-turn state, publish host capabilities, resolve
 * policy and guards, prepare context and memory, run the model-side runtime,
 * mint ids and timestamps, enforce request policy, and emit observability.
 * The Effect Layer binds these jobs to real app adapters at composition time, so
 * partner-ai-core can coordinate the turn without importing HTTP, database,
 * provider, or tool-adapter packages.
 *
 * Update this comment when the core workflow gains or loses an app-supplied
 * capability, or when a capability's job moves across package boundaries.
 */

export class ConversationRepositoryService extends Context.Service<
  ConversationRepositoryService,
  ConversationRepositoryPort
>()("@side-chat/partner-ai-core/ConversationRepositoryService") {}

export class AssistantTurnLifecycleService extends Context.Service<
  AssistantTurnLifecycleService,
  AssistantTurnLifecyclePort
>()("@side-chat/partner-ai-core/AssistantTurnLifecycleService") {}

export class HostCapabilityManifestService extends Context.Service<
  HostCapabilityManifestService,
  HostCapabilityManifestPort
>()("@side-chat/partner-ai-core/HostCapabilityManifestService") {}

export class TurnPolicyResolverService extends Context.Service<
  TurnPolicyResolverService,
  TurnPolicyResolverPort
>()("@side-chat/partner-ai-core/TurnPolicyResolverService") {}

export class TurnGuardRegistryService extends Context.Service<
  TurnGuardRegistryService,
  TurnGuardRegistryPort
>()("@side-chat/partner-ai-core/TurnGuardRegistryService") {}

export class ContextManagerService extends Context.Service<
  ContextManagerService,
  ContextManagerPort
>()("@side-chat/partner-ai-core/ContextManagerService") {}

export class MemoryService extends Context.Service<MemoryService, MemoryPort>()(
  "@side-chat/partner-ai-core/MemoryService",
) {}

export class AgentRuntimeService extends Context.Service<AgentRuntimeService, AgentRuntimePort>()(
  "@side-chat/partner-ai-core/AgentRuntimeService",
) {}

export class ClockService extends Context.Service<ClockService, ClockPort>()(
  "@side-chat/partner-ai-core/ClockService",
) {}

export class IdGeneratorService extends Context.Service<IdGeneratorService, IdGeneratorPort>()(
  "@side-chat/partner-ai-core/IdGeneratorService",
) {}

export class PolicyService extends Context.Service<PolicyService, PolicyPort>()(
  "@side-chat/partner-ai-core/PolicyService",
) {}

export class ObservabilityService extends Context.Service<
  ObservabilityService,
  ObservabilitySinkPort
>()("@side-chat/partner-ai-core/ObservabilityService") {}

export type PartnerAiCoreServices =
  | ConversationRepositoryService
  | AssistantTurnLifecycleService
  | HostCapabilityManifestService
  | TurnPolicyResolverService
  | TurnGuardRegistryService
  | ContextManagerService
  | MemoryService
  | AgentRuntimeService
  | ClockService
  | IdGeneratorService
  | PolicyService
  | ObservabilityService;

export type PartnerAiCoreLayerInput = {
  readonly conversations: ConversationRepositoryPort;
  readonly assistantTurns: AssistantTurnLifecyclePort;
  readonly hostCapabilities: HostCapabilityManifestPort;
  readonly turnPolicies: TurnPolicyResolverPort;
  readonly turnGuards: TurnGuardRegistryPort;
  readonly contextManager: ContextManagerPort;
  readonly memory: MemoryPort;
  readonly runtime: AgentRuntimePort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly policies: PolicyPort;
  readonly observability?: ObservabilitySinkPort;
};

/**
 * Build the core service environment from app-owned ports.
 *
 * Observability has a no-op default because it does not change product
 * behavior. Policy is required so every turn has an explicit request gate.
 */
export const createPartnerAiCoreLayer = (
  input: PartnerAiCoreLayerInput,
): Layer.Layer<PartnerAiCoreServices> =>
  Layer.mergeAll(
    Layer.succeed(ConversationRepositoryService, input.conversations),
    Layer.succeed(AssistantTurnLifecycleService, input.assistantTurns),
    Layer.succeed(HostCapabilityManifestService, input.hostCapabilities),
    Layer.succeed(TurnPolicyResolverService, input.turnPolicies),
    Layer.succeed(TurnGuardRegistryService, input.turnGuards),
    Layer.succeed(ContextManagerService, input.contextManager),
    Layer.succeed(MemoryService, input.memory),
    Layer.succeed(AgentRuntimeService, input.runtime),
    Layer.succeed(ClockService, input.clock),
    Layer.succeed(IdGeneratorService, input.ids),
    Layer.succeed(PolicyService, input.policies),
    Layer.succeed(ObservabilityService, input.observability ?? NOOP_OBSERVABILITY_SINK),
  );

/**
 * Read all core services as one port object.
 *
 * This small adapter keeps the use case files readable while still letting the
 * native API be an Effect `Stream` that depends on services. It is intentionally
 * one-way: service lookup happens here, business logic stays in application.
 */
export const partnerAiCoreServicesEffect = Effect.gen(function* () {
  return {
    conversations: yield* ConversationRepositoryService,
    assistantTurns: yield* AssistantTurnLifecycleService,
    hostCapabilities: yield* HostCapabilityManifestService,
    turnPolicies: yield* TurnPolicyResolverService,
    turnGuards: yield* TurnGuardRegistryService,
    contextManager: yield* ContextManagerService,
    memory: yield* MemoryService,
    runtime: yield* AgentRuntimeService,
    clock: yield* ClockService,
    ids: yield* IdGeneratorService,
    policies: yield* PolicyService,
    observability: yield* ObservabilityService,
  };
});
