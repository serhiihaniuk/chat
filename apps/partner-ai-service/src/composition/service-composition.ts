import {
  createAgentRuntime,
  createFakeProvider,
  createMockWebSearchTool,
  createOpenAIResponsesProvider,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
  OPENAI_PROVIDER_ID,
  type AgentRuntime,
  type AssistantProvider,
} from "@side-chat/agent-runtime";
import {
  createMemorySidechatRepositories,
  createPostgresDrizzleSidechatRepositories,
  type SidechatRepositories,
} from "@side-chat/db";

import { createDevelopmentAuthConfig, type ServiceAuthConfig } from "#adapters/auth/service-auth";
import {
  createDefaultPolicyConfig,
  type ServicePolicyConfig,
} from "#adapters/policy/service-policy";
import type { WorkspaceRef } from "@side-chat/partner-ai-core";

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
  readonly auth: ServiceAuthConfig;
  readonly policies: ServicePolicyConfig;
  readonly persistence: PersistenceConfig;
  readonly repositories: SidechatRepositories;
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
};

export const composePartnerAiService = (options: ServiceCompositionOptions): ServiceComposition => {
  const auth = options.auth ?? createDevelopmentAuthConfig(options.workspace);
  const policies = options.policies ?? createDefaultPolicyConfig(auth.profile);
  const persistence =
    options.persistence ?? defaultPersistenceForComposition(auth.profile, options.repositories);
  const repositories = options.repositories ?? createRepositoriesForPersistence(persistence);
  const runtimeConfig = options.runtime ?? { provider: "fake" };
  const runtime = options.agentRuntime ?? createRuntimeForConfig(runtimeConfig);

  return {
    workspace: options.workspace,
    auth,
    policies,
    persistence,
    repositories,
    runtime,
    runtimeProviderId: providerIdForRuntime(runtimeConfig),
    runtimeModelId: modelIdForRuntime(runtimeConfig),
    persistenceLabel: persistence.kind === "postgres" ? "postgres-drizzle" : "memory",
  };
};

const createRuntimeForConfig = (config: RuntimeConfig & RuntimeToolConfig): AgentRuntime =>
  createAgentRuntime({
    providers: [createProviderForRuntime(config)],
    tools: config.enableMockWebSearch ? [createMockWebSearchTool()] : [],
  });

const createProviderForRuntime = (config: RuntimeConfig): AssistantProvider => {
  if (config.provider === "openai") {
    return createOpenAIResponsesProvider({
      apiKey: config.apiKey,
      modelIds: config.modelIds,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      ...(config.fetch ? { fetch: config.fetch } : {}),
      ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
      ...(config.reasoningSummary ? { reasoningSummary: config.reasoningSummary } : {}),
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
