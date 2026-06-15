import {
  createAgentRuntime,
  createFakeProvider,
  createOpenAIResponsesProvider,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
  OPENAI_PROVIDER_ID,
  type AgentRuntime,
  type ModelProvider,
} from "@side-chat/agent-runtime";
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
import { createMockWebSearchTool } from "#adapters/tools/mock-web-search-tool";
import { assertProductionCapabilityStatus } from "#composition/capabilities/capability-status";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
import { createServiceContextManager } from "./context-manager/service-context-manager.js";
import {
  createServiceHostCapabilityManifest,
  createServiceTurnPolicyResolver,
  createStaticHostCapabilityManifestPort,
} from "./manifest/service-capability-manifest.js";
import {
  createCapabilityStatusForComposition,
  resolveCapabilityManifestInputs,
  selectCapabilityAdapters,
} from "#composition/capabilities/service-capability-composition";
import type {
  PersistenceConfig,
  RuntimeConfig,
  RuntimeToolConfig,
  ServiceComposition,
  ServiceCompositionOptions,
} from "./service-composition-types.js";

export type {
  OpenAIReasoningEffort,
  OpenAIReasoningSummary,
  PersistenceConfig,
  RuntimeConfig,
  RuntimeToolConfig,
  ServiceComposition,
  ServiceCompositionOptions,
} from "./service-composition-types.js";

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

  // Choose the runtime identity before building the manifest. Core later checks
  // the manifest against these ids, so they must describe the runtime we create
  // below or the injected runtime the caller provided.
  const runtimeConfig = options.runtime ?? { provider: "fake" };
  const runtimeProviderId = providerIdForRuntime(runtimeConfig);
  const runtimeModelId = modelIdForRuntime(runtimeConfig);
  const capabilityManifestInputs = resolveCapabilityManifestInputs(options, capabilityConfig);

  // Publish what this service can offer to core. The manifest names available
  // tools, commands, memory, retrieval, research, and guards; turn policy still
  // chooses which of them a single request may use.
  const manifest = createServiceHostCapabilityManifest({
    runtimeConfig,
    providerId: runtimeProviderId,
    modelId: runtimeModelId,
    toolCapabilities: runtimeConfig.toolCapabilities,
    hostCommands: runtimeConfig.hostCommands,
    approvalPolicies: runtimeConfig.approvalPolicies,
    ...capabilityManifestInputs,
    turnGuardIds: options.turnGuardIds,
  });
  const capabilities = createCapabilityStatusForComposition({
    options,
    capabilityConfig,
    manifest,
    persistenceKind: persistenceLabel === "postgres-drizzle" ? "postgres" : "memory",
  });
  assertProductionCapabilityStatus(capabilities, auth.profile);

  // Create the executor side of the service. Tests may inject a prepared
  // AgentRuntime; otherwise config becomes either fake local runtime or OpenAI.
  const runtime = options.agentRuntime ?? createRuntimeForConfig(runtimeConfig);

  // Context adapters are optional for local boot, but the no-op versions mean
  // "no memory/RAG/research was provided", not "feature is production-ready".
  const { memory, ragRetriever, researchAgent } = selectCapabilityAdapters(
    capabilityConfig,
    options,
  );
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
    turnGuards: options.turnGuards ?? createNoopTurnGuardRegistry(),
    memory,
    ragRetriever,
    researchAgent,
    contextManager: createServiceContextManager({
      historyContext,
      memory,
      ragRetriever,
      researchAgent,
      history: capabilityConfig.history,
      contextAdmission: capabilityConfig.contextAdmission,
    }),
    runtime,
    runtimeProviderId,
    runtimeModelId,
    persistenceLabel,
    capabilities,
  };
};

const createRuntimeForConfig = (config: RuntimeConfig & RuntimeToolConfig): AgentRuntime =>
  createAgentRuntime({
    executors: config.executors,
    providers: [createProviderForRuntime(config)],
    tools: [
      ...(config.enableMockWebSearch ? [createMockWebSearchTool()] : []),
      ...(config.runtimeTools ?? []),
    ],
  });

const createProviderForRuntime = (config: RuntimeConfig): ModelProvider => {
  if (config.provider === "openai") {
    return createOpenAIResponsesProvider({
      apiKey: config.apiKey,
      modelIds: config.modelIds,
      baseUrl: config.baseUrl === "" ? undefined : config.baseUrl,
      fetch: config.fetch,
      reasoningEffort: config.reasoningEffort,
      reasoningSummary: config.reasoningSummary,
    });
  }

  return createFakeProvider({
    modelIds: [config.modelId ?? FAKE_ECHO_MODEL_ID],
  });
};

const providerIdForRuntime = (config: RuntimeConfig): string =>
  config.provider === "openai" ? OPENAI_PROVIDER_ID : FAKE_PROVIDER_ID;

const modelIdForRuntime = (config: RuntimeConfig): string =>
  config.provider === "openai" ? config.defaultModelId : (config.modelId ?? FAKE_ECHO_MODEL_ID);

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
