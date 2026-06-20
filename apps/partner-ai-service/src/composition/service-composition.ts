import { createNoopTurnGuardRegistry } from "#adapters/guards/noop-turn-guard-registry";
import { DEFAULT_SERVICE_CONVERSATION_TITLE_GENERATION } from "#config/sidechat-config/conversation-title";
import { createServiceTurnProfileBundle } from "./factories/create-service-turn-profile-bundle.js";
import { createServiceCapabilityBundle } from "./factories/create-service-capability-bundle.js";
import { createServiceContextBundle } from "./factories/create-service-context-bundle.js";
import { createServiceDiagnostics } from "./factories/create-service-diagnostics.js";
import { createServicePersistenceBundle } from "./factories/create-service-persistence-bundle.js";
import { createServiceProviderBundle } from "./factories/create-service-provider-bundle.js";
import { createServiceRuntimeBundle } from "./factories/create-service-runtime-bundle.js";
import { createServiceSecurityPorts } from "./factories/create-service-security-ports.js";
import { createServiceToolBundle } from "./factories/create-service-tool-bundle.js";
import { createStreamChatPorts } from "./factories/create-stream-chat-ports.js";
import type { ServiceComposition, ServiceCompositionOptions } from "./service-composition-types.js";

export type {
  PersistenceConfig,
  RuntimeConfig,
  RuntimeModelMetadata,
  RuntimeToolConfig,
  ServiceComposition,
  ServiceCompositionOptions,
} from "./service-composition-types.js";

export type { OpenAIReasoningEffort, OpenAIReasoningSummary } from "@side-chat/agent-runtime";
export {
  createServiceProviderRegistry,
  SERVICE_MODEL_RETENTION_POLICIES,
  ServiceProviderRegistryError,
} from "#composition/providers/service-provider-registry";
export type {
  ServiceModelRetentionPolicy,
  ServiceProviderRegistration,
  ServiceProviderRegistryStatus,
  ServiceReasoningPolicy,
} from "#composition/providers/service-provider-registry";

export {
  createServiceToolRegistration,
  createServiceToolRegistry,
  ServiceToolRegistryError,
} from "#composition/tools/service-tool-registry";
export type {
  ServiceToolRegistration,
  ServiceToolRegistryStatus,
} from "#composition/tools/service-tool-registry";

export {
  createTurnProfileRegistry,
  TurnProfileRegistryError,
} from "#composition/turn-profile/turn-profile-registry";
export type {
  TurnProfileRegistry,
  ServiceTurnProfileConfig,
  ServiceTurnProfile,
} from "#composition/turn-profile/turn-profile-registry";
export {
  createDefaultTurnProfileConfig,
  DEFAULT_TURN_PROFILE_ID,
  DEFAULT_TURN_PROFILE_SYSTEM_PROMPT_ID,
} from "#composition/turn-profile/default-turn-profile-config";
export {
  createDefaultSystemPromptBuilder,
  SystemPromptBuilderError,
} from "#composition/turn-profile/system-prompt-builder";
export type {
  BuiltSystemPrompt,
  SystemPromptBuilder,
  SystemPromptDefinition,
  SystemPromptSection,
} from "#composition/turn-profile/system-prompt-builder";

/**
 * Build the service graph used by HTTP routes.
 *
 * This is the app composition root: each factory turns configuration into one
 * named bundle, and construction reads top to bottom in dependency order. Routes
 * receive ready ports, status, and diagnostics instead of knowing how to
 * assemble core, runtime, and DB. Production call sites should pass explicit
 * adapters instead of relying on the development fallbacks each factory owns.
 */
export const composePartnerAiService = (options: ServiceCompositionOptions): ServiceComposition => {
  const turnGuards = options.turnGuards ?? createNoopTurnGuardRegistry();

  const security = createServiceSecurityPorts(options);
  const persistence = createServicePersistenceBundle(options, security);
  const providers = createServiceProviderBundle(options);
  const tools = createServiceToolBundle(options);
  const turnProfiles = createServiceTurnProfileBundle(options, {
    providers: providers.registry,
    tools: tools.registry,
    turnGuardIds: options.turnGuardIds ?? [],
    registeredGuardIds: turnGuards.guards.map((guard) => guard.guardId),
  });
  const capabilities = createServiceCapabilityBundle(options, {
    turnProfiles: turnProfiles.registry,
    providers: providers.registry,
    tools: tools.registry,
    persistence,
  });
  const context = createServiceContextBundle(options, {
    repositories: persistence.repositories,
  });
  const runtime = createServiceRuntimeBundle(options, { providers, tools });
  const streamChat = createStreamChatPorts({
    persistence,
    capabilities,
    context,
    runtime,
    security,
    turnGuards,
    titleGeneration:
      options.conversationTitleGeneration ?? DEFAULT_SERVICE_CONVERSATION_TITLE_GENERATION,
    observability: options.observability,
  });

  return {
    workspace: options.workspace,
    hostAppId: capabilities.manifest.hostAppId,
    auth: security.auth,
    policies: security.policies,
    persistence: persistence.persistence,
    repositories: persistence.repositories,
    runtime: runtime.runtime,
    ports: streamChat.ports,
    capabilities: capabilities.capabilityStatus,
    diagnostics: createServiceDiagnostics({
      persistence,
      providers,
      tools,
      turnProfiles,
    }),
  };
};
