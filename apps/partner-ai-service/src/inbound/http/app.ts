import type {
  ObservabilitySinkPort,
  ConversationTitleGenerationPort,
  TurnGuardRegistryPort,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";
import type { AgentRuntime } from "@side-chat/agent-runtime";
import type { SidechatRepositories } from "@side-chat/db";
import { Hono } from "hono";

import { createServiceAuthVerifier, type ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import {
  composePartnerAiService,
  type PersistenceConfig,
  type RuntimeConfig,
  type RuntimeToolConfig,
  type ServiceTurnProfileConfig,
  type ServiceCompositionOptions,
} from "#composition/service-composition";
import type { ServiceCapabilityConfig } from "#composition/capabilities/service-capability-settings";
import { authContextMiddleware, type AuthContextVariables } from "./middleware/auth-context.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { requireAuth } from "./middleware/require-auth.js";
import { registerChatHistoryRoutes } from "./routes/chat/chat-history.js";
import { registerChatRunsRoute } from "./routes/chat/runs/chat-runs.js";
import { registerChatStreamRoute } from "./routes/chat/chat-stream.js";
import { registerChatUsageRoute } from "./routes/chat/chat-usage.js";
import { registerHealthRoutes } from "./routes/health/health.js";
import { registerModelsRoute } from "./routes/models/models.js";

const DEFAULT_WORKSPACE: WorkspaceRef = {
  tenantId: "tenant_local",
  workspaceId: "workspace_local",
};

/**
 * HTTP-facing options for embedding the service in tests, local boot, or a host app.
 *
 * These inputs are still service-layer dependencies. `createPartnerAiServiceApp`
 * forwards them into composition and route registration; it does not reinterpret
 * product policy, rebuild runtime providers, or expose adapter secrets through
 * the Hono app.
 */
export type PartnerAiServiceOptions = {
  readonly repositories?: SidechatRepositories | undefined;
  readonly auth?: ServiceAuthConfig | undefined;
  readonly observability?: ObservabilitySinkPort | undefined;
  readonly policies?: ServicePolicyConfig | undefined;
  readonly persistence?: PersistenceConfig | undefined;
  readonly runtime?: (RuntimeConfig & RuntimeToolConfig) | undefined;
  readonly agentRuntime?: AgentRuntime | undefined;
  readonly conversationTitleGeneration?: ConversationTitleGenerationPort | undefined;
  /**
   * Capability declarations forwarded to service composition.
   *
   * HTTP setup does not interpret these values; composition turns them into
   * manifest entries, context budgets, health status, and selected ports.
   */
  readonly capabilities?: ServiceCapabilityConfig | undefined;
  readonly turnProfiles?: readonly ServiceTurnProfileConfig[] | undefined;
  readonly defaultTurnProfileId?: string | undefined;
  readonly turnGuards?: TurnGuardRegistryPort | undefined;
  readonly turnGuardIds?: readonly string[] | undefined;
  readonly workspace?: WorkspaceRef | undefined;
};

/**
 * Create the Hono app for the service.
 *
 * This is where routes receive already-built dependencies. Route files should
 * parse requests and write responses, not rebuild policy, storage, or runtime
 * wiring.
 */
export const createPartnerAiServiceApp = (options: PartnerAiServiceOptions = {}) => {
  const app = new Hono<AuthContextVariables>();
  const composition = composePartnerAiService(compositionOptions(options));
  const authority = createServiceAuthVerifier(composition.auth);

  app.use("*", requestIdMiddleware());

  registerHealthRoutes(app, {
    authConfig: composition.auth,
    policyConfig: composition.policies,
    providerId: composition.diagnostics.runtimeProviderId,
    modelId: composition.diagnostics.runtimeModelId,
    providers: composition.diagnostics.providerRegistryStatus,
    tools: composition.diagnostics.toolRegistryStatus,
    persistenceLabel: composition.diagnostics.persistenceLabel,
    capabilities: composition.capabilities,
  });

  app.use("/models", authContextMiddleware(authority), requireAuth());
  app.use("/chat/*", authContextMiddleware(authority), requireAuth());
  app.use("/usage", authContextMiddleware(authority), requireAuth());

  registerModelsRoute(app, composition.policies, composition.diagnostics.providerRegistryStatus);
  registerChatHistoryRoutes(app, {
    repositories: composition.repositories,
    clock: composition.ports.clock,
  });
  registerChatUsageRoute(app, composition.repositories);
  registerChatStreamRoute(app, {
    workspace: composition.workspace,
    hostAppId: composition.hostAppId,
    ports: composition.ports,
  });
  registerChatRunsRoute(app, { turnRunner: composition.turnRunner });

  return app;
};

export type PartnerAiServiceApp = ReturnType<typeof createPartnerAiServiceApp>;

const compositionOptions = (options: PartnerAiServiceOptions): ServiceCompositionOptions => ({
  workspace: options.workspace ?? DEFAULT_WORKSPACE,
  auth: options.auth,
  policies: options.policies,
  persistence: options.persistence,
  repositories: options.repositories,
  runtime: options.runtime,
  agentRuntime: options.agentRuntime,
  conversationTitleGeneration: options.conversationTitleGeneration,
  observability: options.observability,
  capabilities: options.capabilities,
  turnProfiles: options.turnProfiles,
  defaultTurnProfileId: options.defaultTurnProfileId,
  turnGuards: options.turnGuards,
  turnGuardIds: options.turnGuardIds,
});
