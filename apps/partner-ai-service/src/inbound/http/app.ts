import type { ObservabilitySinkPort, WorkspaceRef } from "@side-chat/partner-ai-core";
import type { AgentRuntime } from "@side-chat/agent-runtime";
import type { SidechatRepositories } from "@side-chat/db";
import { Hono } from "hono";

import { createServiceAuthVerifier, type ServiceAuthConfig } from "#adapters/auth/service-auth";
import { createServicePolicyPort, type ServicePolicyConfig } from "#adapters/policy/service-policy";
import {
  composePartnerAiService,
  type PersistenceConfig,
  type RuntimeConfig,
  type RuntimeToolConfig,
  type ServiceCompositionOptions,
} from "#composition/service-composition";
import { authContextMiddleware, type AuthContextVariables } from "./middleware/auth-context.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { requireAuth } from "./middleware/require-auth.js";
import { registerChatHistoryRoutes } from "./routes/chat-history.js";
import { registerChatStreamRoute } from "./routes/chat-stream.js";
import { registerChatUsageRoute } from "./routes/chat-usage.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerModelsRoute } from "./routes/models.js";

const DEFAULT_WORKSPACE: WorkspaceRef = {
  tenantId: "tenant_local",
  workspaceId: "workspace_local",
};

export type PartnerAiServiceOptions = {
  readonly repositories?: SidechatRepositories;
  readonly auth?: ServiceAuthConfig;
  readonly observability?: ObservabilitySinkPort;
  readonly policies?: ServicePolicyConfig;
  readonly persistence?: PersistenceConfig;
  readonly runtime?: RuntimeConfig & RuntimeToolConfig;
  readonly agentRuntime?: AgentRuntime;
  readonly persistenceLabel?: "memory" | "postgres-drizzle";
  readonly workspace?: WorkspaceRef;
};

export const createPartnerAiServiceApp = (options: PartnerAiServiceOptions = {}) => {
  const app = new Hono<AuthContextVariables>();
  const composition = composePartnerAiService(compositionOptions(options));
  const authority = createServiceAuthVerifier(composition.auth);
  const policies = createServicePolicyPort(composition.policies);
  const persistenceLabel = options.persistenceLabel ?? composition.persistenceLabel;

  app.use("*", requestIdMiddleware());

  registerHealthRoutes(app, {
    authConfig: composition.auth,
    policyConfig: composition.policies,
    providerId: composition.runtimeProviderId,
    modelId: composition.runtimeModelId,
    persistenceLabel,
  });

  app.use("/models", authContextMiddleware(authority), requireAuth());
  app.use("/chat/*", authContextMiddleware(authority), requireAuth());
  app.use("/usage", authContextMiddleware(authority), requireAuth());

  registerModelsRoute(app, composition.policies, {
    providerId: composition.runtimeProviderId,
    modelId: composition.runtimeModelId,
  });
  registerChatHistoryRoutes(app, {
    repositories: composition.repositories,
  });
  registerChatUsageRoute(app, composition.repositories);
  registerChatStreamRoute(app, {
    workspace: composition.workspace,
    hostAppId: composition.hostAppId,
    repositories: composition.repositories,
    hostCapabilities: composition.hostCapabilities,
    turnPolicies: composition.turnPolicies,
    contextManager: composition.contextManager,
    runtime: composition.runtime,
    policies,
    ...observabilityField(options.observability),
  });

  return app;
};

export type PartnerAiServiceApp = ReturnType<typeof createPartnerAiServiceApp>;

const compositionOptions = (options: PartnerAiServiceOptions): ServiceCompositionOptions => ({
  workspace: options.workspace ?? DEFAULT_WORKSPACE,
  ...authField(options.auth),
  ...policiesField(options.policies),
  ...persistenceField(options.persistence),
  ...repositoriesField(options.repositories),
  ...runtimeField(options.runtime),
  ...agentRuntimeField(options.agentRuntime),
});

const authField = (auth: ServiceAuthConfig | undefined): { readonly auth?: ServiceAuthConfig } =>
  auth ? { auth } : {};

const policiesField = (
  policies: ServicePolicyConfig | undefined,
): { readonly policies?: ServicePolicyConfig } => (policies ? { policies } : {});

const persistenceField = (
  persistence: PersistenceConfig | undefined,
): { readonly persistence?: PersistenceConfig } => (persistence ? { persistence } : {});

const repositoriesField = (
  repositories: SidechatRepositories | undefined,
): { readonly repositories?: SidechatRepositories } => (repositories ? { repositories } : {});

const runtimeField = (
  runtime: (RuntimeConfig & RuntimeToolConfig) | undefined,
): { readonly runtime?: RuntimeConfig & RuntimeToolConfig } => (runtime ? { runtime } : {});

const agentRuntimeField = (
  agentRuntime: AgentRuntime | undefined,
): { readonly agentRuntime?: AgentRuntime } => (agentRuntime ? { agentRuntime } : {});

const observabilityField = (
  observability: ObservabilitySinkPort | undefined,
): { readonly observability?: ObservabilitySinkPort } => (observability ? { observability } : {});
