import { createAgentRuntime } from "@side-chat/agent-runtime";
import {
  createMemorySidechatRepositories,
  createPostgresDrizzleSidechatRepositories,
  isRepositoryAdapterKind,
  REPOSITORY_ADAPTER_KINDS,
  type RepositoryAdapterKind,
  type SidechatRepositories,
} from "@side-chat/db";

import { createDevelopmentAuthConfig, type ServiceAuthConfig } from "#adapters/auth/service-auth";
import { createNoopTurnGuardRegistry } from "#adapters/guards/noop-turn-guard-registry";
import { createRepositoryConversationHistoryContext } from "#adapters/persistence/repository-conversation-history-context";
import { createDefaultPolicyConfig } from "#adapters/policy/service-policy";
import { DEFAULT_SERVICE_CONVERSATION_TITLE_GENERATION } from "#config/service-conversation-title-config";
import { assertProductionCapabilityStatus } from "#composition/capabilities/capability-status";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
import { createServiceProviderRegistry } from "#composition/providers/service-provider-registry";
import { createServiceToolRegistry } from "#composition/tools/service-tool-registry";
import {
  buildAssistantProfileRegistry,
  providerRegistrationForConfig,
  toolRegistrationsForConfig,
} from "./service-composition-builders.js";
import { createServiceContextManager } from "./context-manager/service-context-manager.js";
import {
  createServiceHostCapabilityManifest,
  createServiceTurnPolicyResolver,
  createStaticHostCapabilityManifestPort,
} from "./manifest/service-capability-manifest.js";
import { createCapabilityStatusForComposition } from "#composition/capabilities/service-capability-composition";
import type {
  PersistenceConfig,
  ServiceComposition,
  ServiceCompositionOptions,
} from "./service-composition-types.js";

export type {
  PersistenceConfig,
  RuntimeConfig,
  RuntimeToolConfig,
  ServiceComposition,
  ServiceCompositionOptions,
} from "./service-composition-types.js";

export {
  createServiceProviderRegistry,
  ServiceProviderRegistryError,
} from "#composition/providers/service-provider-registry";
export type {
  OpenAIReasoningEffort,
  OpenAIReasoningSummary,
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
  createAssistantProfileRegistry,
  AssistantProfileRegistryError,
} from "#composition/assistant/assistant-profile-registry";
export type {
  AssistantProfileRegistry,
  ServiceAssistantConfig,
  ServiceAssistantProfile,
  ServiceAssistantSafetyConfig,
  ServiceToolPolicyConfig,
} from "#composition/assistant/assistant-profile-registry";
export {
  createDefaultAssistantConfig,
  DEFAULT_ASSISTANT_PROFILE_ID,
  DEFAULT_ASSISTANT_SYSTEM_PROMPT_ID,
} from "#composition/assistant/default-assistant-config";
export {
  createDefaultSystemPromptBuilder,
  SystemPromptBuilderError,
} from "#composition/assistant/system-prompt-builder";
export type {
  BuiltSystemPrompt,
  SystemPromptBuilder,
  SystemPromptDefinition,
  SystemPromptSection,
} from "#composition/assistant/system-prompt-builder";

/**
 * Build the service graph used by HTTP routes.
 *
 * This is the app composition root: configuration becomes the concrete auth,
 * policy, database, runtime, manifest, context, and guard ports that core uses
 * for every stream-chat request. It also owns the local defaults, which is why
 * production call sites should be explicit instead of relying on fallback ports.
 */
export const composePartnerAiService = (options: ServiceCompositionOptions): ServiceComposition => {
  // Establish the environment first. Auth profile chooses policy defaults and
  // decides whether missing persistence is allowed to fall back to memory.
  const auth = options.auth ?? createDevelopmentAuthConfig(options.workspace);
  const policies = options.policies ?? createDefaultPolicyConfig(auth.profile);
  const persistence =
    options.persistence ?? defaultPersistenceForComposition(auth.profile, options.repositories);
  const repositories = options.repositories ?? createRepositoriesForPersistence(persistence);
  if (options.persistence) assertPersistenceMatchesRepositories(options.persistence, repositories);
  const persistenceLabel = persistenceLabelForRepositories(repositories);
  const capabilityConfig = options.capabilities ?? DEFAULT_SERVICE_CAPABILITY_CONFIG;

  // Build the provider and tool registries before the manifest. Each registry is
  // the single source for its surface: the provider registry decides the runtime
  // identity, and the tool registry supplies both manifest capabilities and the
  // matching runtime executables.
  const runtimeConfig = options.runtime ?? { provider: "fake" };
  const providerRegistry = createServiceProviderRegistry([
    providerRegistrationForConfig(runtimeConfig),
  ]);
  const toolRegistry = createServiceToolRegistry(toolRegistrationsForConfig(runtimeConfig));
  const runtimeProviderId = providerRegistry.defaultProviderId;
  const runtimeModelId = providerRegistry.defaultModelId;
  const conversationTitleGeneration =
    options.conversationTitleGeneration ?? DEFAULT_SERVICE_CONVERSATION_TITLE_GENERATION;

  // Build assistant profiles before the manifest. The default assistant and any
  // adopter-provided assistants go through the same registry, which validates
  // them against the provider, tool, and guard registries and builds the prompt.
  const turnGuards = options.turnGuards ?? createNoopTurnGuardRegistry();
  const assistantRegistry = buildAssistantProfileRegistry({
    options,
    providerRegistry,
    toolRegistry,
    turnGuards,
  });

  // Publish what this service can offer to core. The manifest names available
  // profiles, tools, and commands; turn policy still chooses which of them a
  // single request may use.
  const manifest = createServiceHostCapabilityManifest({
    assistantProfiles: assistantRegistry.assistantProfiles,
    defaultProfileId: assistantRegistry.defaultProfileId,
    toolCapabilities: toolRegistry.toolCapabilities,
    hostCommands: runtimeConfig.hostCommands,
    approvalPolicies: runtimeConfig.approvalPolicies,
  });
  const capabilities = createCapabilityStatusForComposition({
    capabilityConfig,
    persistenceKind: persistenceLabel === "postgres-drizzle" ? "postgres" : "memory",
  });
  assertProductionCapabilityStatus(capabilities, auth.profile);

  // Create the executor side of the service. Tests may inject a prepared
  // AgentRuntime; otherwise the registries become the runtime providers and tools.
  const runtime =
    options.agentRuntime ??
    createAgentRuntime({
      executors: runtimeConfig.executors,
      providers: providerRegistry.providers,
      tools: toolRegistry.runtimeTools,
    });

  const historyContext = createRepositoryConversationHistoryContext(repositories);

  // Return the complete graph in one object so HTTP routes can stay thin: they
  // receive ready ports instead of knowing how to assemble core, runtime, and DB.
  return {
    workspace: options.workspace,
    hostAppId: manifest.hostAppId,
    auth,
    policies,
    persistence,
    repositories,
    hostCapabilities: createStaticHostCapabilityManifestPort(manifest),
    turnPolicies: createServiceTurnPolicyResolver(),
    turnGuards,
    contextManager: createServiceContextManager({
      historyContext,
      history: capabilityConfig.history,
      contextAdmission: capabilityConfig.contextAdmission,
    }),
    runtime,
    conversationTitleGeneration,
    runtimeProviderId,
    runtimeModelId,
    providerRegistryStatus: providerRegistry.status,
    toolRegistryStatus: toolRegistry.status,
    assistantProfiles: assistantRegistry.serviceProfiles,
    persistenceLabel,
    capabilities,
  };
};

const createRepositoriesForPersistence = (persistence: PersistenceConfig): SidechatRepositories => {
  if (persistence.kind === "postgres") {
    return createPostgresDrizzleSidechatRepositories({
      connectionString: persistence.databaseUrl,
    });
  }

  return createMemorySidechatRepositories();
};

const persistenceLabelForRepositories = (
  repositories: SidechatRepositories,
): ServiceComposition["persistenceLabel"] => {
  const adapterKind = repositoryAdapterKindForComposition(repositories);
  switch (adapterKind) {
    case REPOSITORY_ADAPTER_KINDS.MEMORY:
      return "memory";
    case REPOSITORY_ADAPTER_KINDS.POSTGRES_DRIZZLE:
      return "postgres-drizzle";
    case REPOSITORY_ADAPTER_KINDS.CUSTOM:
      throw new Error(
        "Custom repositories require service-level persistence metadata before composition can report persistence diagnostics.",
      );
  }

  const unhandledKind: never = adapterKind;
  return unhandledKind;
};

/**
 * Read the repository identity promised by `@side-chat/db`.
 *
 * Injected repository objects come from app code or tests, so composition still
 * checks the runtime value before publishing persistence diagnostics. Missing
 * or unknown markers fail closed instead of becoming local memory persistence.
 */
const repositoryAdapterKindForComposition = (
  repositories: SidechatRepositories,
): RepositoryAdapterKind => {
  const adapterKind = (repositories as { readonly adapterKind?: unknown }).adapterKind;
  if (isRepositoryAdapterKind(adapterKind)) {
    return adapterKind;
  }

  throw new Error(
    "Injected repositories must declare a valid adapterKind; service composition cannot infer persistence from untagged repositories.",
  );
};

const assertPersistenceMatchesRepositories = (
  persistence: PersistenceConfig,
  repositories: SidechatRepositories,
): void => {
  const actualLabel = persistenceLabelForRepositories(repositories);
  const expectedLabel = persistence.kind === "postgres" ? "postgres-drizzle" : "memory";
  if (actualLabel === expectedLabel) return;

  throw new Error(
    `Persistence config ${persistence.kind} does not match injected ${actualLabel} repositories.`,
  );
};

const defaultPersistenceForComposition = (
  profile: ServiceAuthConfig["profile"],
  repositories: SidechatRepositories | undefined,
): PersistenceConfig => {
  if (repositories) return { kind: "memory" };

  if (profile === "production") return failMissingProductionPersistence();

  return { kind: "memory" };
};

const failMissingProductionPersistence = (): never => {
  throw new Error(
    "Production profile requires SIDECHAT_DATABASE_URL for Postgres/Drizzle persistence.",
  );
};
