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
  type SidechatRepositories,
} from "@side-chat/db";
import { optionalField } from "@side-chat/shared";

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
    ...optionalField("toolCapabilities", runtimeConfig.toolCapabilities),
    ...optionalField("hostCommands", runtimeConfig.hostCommands),
    ...optionalField("approvalPolicies", runtimeConfig.approvalPolicies),
    ...capabilityManifestInputs,
    ...optionalField("turnGuardIds", options.turnGuardIds),
  });
  const capabilities = createCapabilityStatusForComposition({
    options,
    capabilityConfig,
    manifest,
    persistenceKind: persistence.kind,
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
    persistenceLabel: persistence.kind === "postgres" ? "postgres-drizzle" : "memory",
    capabilities,
  };
};

const createRuntimeForConfig = (config: RuntimeConfig & RuntimeToolConfig): AgentRuntime =>
  createAgentRuntime({
    ...optionalField("executors", config.executors),
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
      ...optionalField("baseUrl", config.baseUrl || undefined),
      ...optionalField("fetch", config.fetch),
      ...optionalField("reasoningEffort", config.reasoningEffort),
      ...optionalField("reasoningSummary", config.reasoningSummary),
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
