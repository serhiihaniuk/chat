import type {
  ObservabilitySinkPort,
  TurnGuardRegistryPort,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";
import type { AgentRuntime } from "@side-chat/agent-runtime";
import type { SidechatRepositories } from "@side-chat/db";
import { optionalField } from "@side-chat/shared";
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
  readonly turnGuards?: TurnGuardRegistryPort;
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
    turnGuards: composition.turnGuards,
    contextManager: composition.contextManager,
    runtime: composition.runtime,
    policies,
    ...optionalField("observability", options.observability),
  });

  return app;
};

export type PartnerAiServiceApp = ReturnType<typeof createPartnerAiServiceApp>;

const compositionOptions = (options: PartnerAiServiceOptions): ServiceCompositionOptions => ({
  workspace: options.workspace ?? DEFAULT_WORKSPACE,
  ...optionalField("auth", options.auth),
  ...optionalField("policies", options.policies),
  ...optionalField("persistence", options.persistence),
  ...optionalField("repositories", options.repositories),
  ...optionalField("runtime", options.runtime),
  ...optionalField("agentRuntime", options.agentRuntime),
  ...optionalField("turnGuards", options.turnGuards),
});
