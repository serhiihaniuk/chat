import { Context, Effect, Layer } from "effect";

import { allowRequestPolicy, type PolicyPort } from "#policies/policy";
import type {
  AgentRuntimePort,
  ClockPort,
  ConversationRepositoryPort,
  IdGeneratorPort,
} from "#ports";
import { NOOP_OBSERVABILITY_SINK, type ObservabilitySinkPort } from "./observability.js";

/**
 * Effect services are the dependency boundary for core workflows.
 *
 * They let `streamChatEffect` ask for "conversation repository" or "runtime"
 * without importing the HTTP app, database package, provider SDK, or concrete
 * tool adapters. The app chooses the real implementations when it builds the
 * Layer.
 */
export class ConversationRepositoryService extends Context.Service<
  ConversationRepositoryService,
  ConversationRepositoryPort
>()("@side-chat/partner-ai-core/ConversationRepositoryService") {}

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
  | AgentRuntimeService
  | ClockService
  | IdGeneratorService
  | PolicyService
  | ObservabilityService;

export type PartnerAiCoreLayerInput = {
  readonly conversations: ConversationRepositoryPort;
  readonly runtime: AgentRuntimePort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly policies?: PolicyPort;
  readonly observability?: ObservabilitySinkPort;
};

/**
 * Build the core service environment from app-owned ports.
 *
 * Policy and observability have safe defaults so development tests can compose
 * the native Effect entrypoint easily. Production still owns the decision to
 * pass real adapters; the core package only provides a fail-open local policy
 * when no policy port was explicitly supplied.
 */
export const createPartnerAiCoreLayer = (
  input: PartnerAiCoreLayerInput,
): Layer.Layer<PartnerAiCoreServices> =>
  Layer.mergeAll(
    Layer.succeed(ConversationRepositoryService, input.conversations),
    Layer.succeed(AgentRuntimeService, input.runtime),
    Layer.succeed(ClockService, input.clock),
    Layer.succeed(IdGeneratorService, input.ids),
    Layer.succeed(PolicyService, input.policies ?? allowRequestPolicy()),
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
    runtime: yield* AgentRuntimeService,
    clock: yield* ClockService,
    ids: yield* IdGeneratorService,
    policies: yield* PolicyService,
    observability: yield* ObservabilityService,
  };
});
