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
  type ContextManagerPort,
  type HostCapabilityManifestPort,
  type RagRetrieverPort,
  type RetrievalSourceCapability,
  type TurnGuardRegistryPort,
  type TurnPolicyResolverPort,
  type WorkspaceRef,
} from "@side-chat/partner-ai-core";
import {
  createMemorySidechatRepositories,
  createPostgresDrizzleSidechatRepositories,
  type SidechatRepositories,
} from "@side-chat/db";
import { optionalField } from "@side-chat/shared";

import { createDevelopmentAuthConfig, type ServiceAuthConfig } from "#adapters/auth/service-auth";
import { createNoopTurnGuardRegistry } from "#adapters/guards/noop-turn-guard-registry";
import {
  createDefaultPolicyConfig,
  type ServicePolicyConfig,
} from "#adapters/policy/service-policy";
import { createNoopRagRetriever } from "#adapters/rag/noop-rag-retriever";
import { createMockWebSearchTool } from "#adapters/tools/mock-web-search-tool";
import { createServiceContextManager } from "./service-context-manager.js";
import {
  createServiceHostCapabilityManifest,
  createServiceTurnPolicyResolver,
  createStaticHostCapabilityManifestPort,
} from "./service-harness.js";

export type PersistenceConfig =
  | { readonly kind: "memory" }
  | { readonly kind: "postgres"; readonly databaseUrl: string };

export type RuntimeConfig =
  | { readonly provider: "fake"; readonly modelId?: string }
  | {
      readonly provider: "openai";
      readonly apiKey: string;
      readonly modelIds: readonly string[];
      readonly defaultModelId: string;
      readonly baseUrl?: string;
      readonly fetch?: typeof fetch;
      readonly reasoningEffort?: OpenAIReasoningEffort;
      readonly reasoningSummary?: OpenAIReasoningSummary;
    };
export type RuntimeToolConfig = {
  readonly enableMockWebSearch?: boolean;
};

export type OpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type OpenAIReasoningSummary = "auto" | "concise" | "detailed";

export type ServiceComposition = {
  readonly workspace: WorkspaceRef;
  readonly hostAppId: string;
  readonly auth: ServiceAuthConfig;
  readonly policies: ServicePolicyConfig;
  readonly persistence: PersistenceConfig;
  readonly repositories: SidechatRepositories;
  readonly hostCapabilities: HostCapabilityManifestPort;
  readonly turnPolicies: TurnPolicyResolverPort;
  readonly turnGuards: TurnGuardRegistryPort;
  readonly ragRetriever: RagRetrieverPort;
  readonly contextManager: ContextManagerPort;
  readonly runtime: AgentRuntime;
  readonly runtimeProviderId: string;
  readonly runtimeModelId: string;
  readonly persistenceLabel: "memory" | "postgres-drizzle";
};

export type ServiceCompositionOptions = {
  readonly workspace: WorkspaceRef;
  readonly auth?: ServiceAuthConfig;
  readonly policies?: ServicePolicyConfig;
  readonly persistence?: PersistenceConfig;
  readonly repositories?: SidechatRepositories;
  readonly runtime?: RuntimeConfig & RuntimeToolConfig;
  readonly agentRuntime?: AgentRuntime;
  readonly turnGuards?: TurnGuardRegistryPort;
  readonly ragRetriever?: RagRetrieverPort;
  readonly retrievalSources?: readonly RetrievalSourceCapability[];
};

export const composePartnerAiService = (options: ServiceCompositionOptions): ServiceComposition => {
  const auth = options.auth ?? createDevelopmentAuthConfig(options.workspace);
  const policies = options.policies ?? createDefaultPolicyConfig(auth.profile);
  const persistence =
    options.persistence ?? defaultPersistenceForComposition(auth.profile, options.repositories);
  const repositories = options.repositories ?? createRepositoriesForPersistence(persistence);
  const runtimeConfig = options.runtime ?? { provider: "fake" };
  const runtimeProviderId = providerIdForRuntime(runtimeConfig);
  const runtimeModelId = modelIdForRuntime(runtimeConfig);
  const manifest = createServiceHostCapabilityManifest({
    runtimeConfig,
    providerId: runtimeProviderId,
    modelId: runtimeModelId,
    ...optionalField("retrievalSources", options.retrievalSources),
  });
  const runtime = options.agentRuntime ?? createRuntimeForConfig(runtimeConfig);
  const ragRetriever = options.ragRetriever ?? createNoopRagRetriever();

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
    ragRetriever,
    contextManager: createServiceContextManager({ ragRetriever }),
    runtime,
    runtimeProviderId,
    runtimeModelId,
    persistenceLabel: persistence.kind === "postgres" ? "postgres-drizzle" : "memory",
  };
};

const createRuntimeForConfig = (config: RuntimeConfig & RuntimeToolConfig): AgentRuntime =>
  createAgentRuntime({
    providers: [createProviderForRuntime(config)],
    tools: config.enableMockWebSearch ? [createMockWebSearchTool()] : [],
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
