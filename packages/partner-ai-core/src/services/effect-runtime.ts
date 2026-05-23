import { Context, Effect, Layer } from "effect";

import type { PolicyPort } from "../policies/policy.js";
import type {
  AgentRuntimePort,
  ClockPort,
  ConversationRepositoryPort,
  IdGeneratorPort,
} from "../ports/index.js";
import type { ObservabilitySinkPort } from "./observability.js";

export class ConversationRepositoryService extends Context.Service<
  ConversationRepositoryService,
  ConversationRepositoryPort
>()("@side-chat/partner-ai-core/ConversationRepositoryService") {}

export class AgentRuntimeService extends Context.Service<
  AgentRuntimeService,
  AgentRuntimePort
>()("@side-chat/partner-ai-core/AgentRuntimeService") {}

export class ClockService extends Context.Service<ClockService, ClockPort>()(
  "@side-chat/partner-ai-core/ClockService",
) {}

export class IdGeneratorService extends Context.Service<
  IdGeneratorService,
  IdGeneratorPort
>()("@side-chat/partner-ai-core/IdGeneratorService") {}

export class PolicyService extends Context.Service<PolicyService, PolicyPort>()(
  "@side-chat/partner-ai-core/PolicyService",
) {}

export class ObservabilityService extends Context.Service<
  ObservabilityService,
  ObservabilitySinkPort
>()("@side-chat/partner-ai-core/ObservabilityService") {}

export type PartnerAiCoreLayerInput = {
  readonly conversations: ConversationRepositoryPort;
  readonly runtime: AgentRuntimePort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly policies: PolicyPort;
  readonly observability: ObservabilitySinkPort;
};

export const createPartnerAiCoreLayer = (
  input: PartnerAiCoreLayerInput,
): Layer.Layer<
  | ConversationRepositoryService
  | AgentRuntimeService
  | ClockService
  | IdGeneratorService
  | PolicyService
  | ObservabilityService
> =>
  Layer.mergeAll(
    Layer.succeed(ConversationRepositoryService, input.conversations),
    Layer.succeed(AgentRuntimeService, input.runtime),
    Layer.succeed(ClockService, input.clock),
    Layer.succeed(IdGeneratorService, input.ids),
    Layer.succeed(PolicyService, input.policies),
    Layer.succeed(ObservabilityService, input.observability),
  );

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
