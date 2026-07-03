import type {
  ObservabilitySinkPort,
  ConversationTitleGenerationPort,
  TurnGuardRegistryPort,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";
import type { AgentRuntime } from "@side-chat/agent-runtime";
import type { SidechatRepositories } from "@side-chat/db";
import { Hono } from "hono";

import {
  createServiceAuthVerifier,
  type ServiceAuthConfig,
  type ServiceAuthVerifier,
} from "#adapters/auth/service-auth";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import {
  composePartnerAiService,
  type PersistenceConfig,
  type ResumabilityOptions,
  type RuntimeConfig,
  type RuntimeToolConfig,
  type ServiceTurnProfileConfig,
  type ServiceCompositionOptions,
} from "#composition/service-composition";
import type { ServiceCapabilityConfig } from "#composition/capabilities/service-capability-settings";
import { authContextMiddleware, type AuthContextVariables } from "./middleware/auth-context.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { requireAuth } from "./middleware/require-auth.js";
import { registerActivityRoutes } from "./routes/chat/activity/activity.js";
import { registerChatHistoryRoutes } from "./routes/chat/chat-history.js";
import { registerChatRunsRoute } from "./routes/chat/runs/chat-runs.js";
import { registerChatTurnRoutes } from "./routes/chat/turns/chat-turns.js";
import { registerChatUsageRoute } from "./routes/chat/chat-usage.js";
import { registerHealthRoutes } from "./routes/health/health.js";
import { registerModelsRoute } from "./routes/models/models.js";
import { registerToolsRoute } from "./routes/tools/tools.js";

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
  /**
   * A custom authority that turns request headers into an `AuthContext`.
   *
   * When present it fully replaces the built-in static-token verifier — an
   * embedder plugs in their JWT/session check here with zero edits to `app.ts`.
   * `AuthContext.subject.subjectId` is the per-user identity every read/write
   * scopes by (conversations, activity, and turn stream/status/cancel).
   */
  readonly authVerifier?: ServiceAuthVerifier | undefined;
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
  /** Resumable-streaming tunables; composition falls back to catalog defaults. */
  readonly resumability?: ResumabilityOptions | undefined;
};

/**
 * A composed service: the Hono app plus its background-lifecycle shutdown.
 *
 * `shutdown` stops the generation runner, reaper, and `LISTEN` dispatchers the
 * composition started, so a long-running host (the Node server) can drain
 * cleanly on SIGTERM. Tests that only exercise HTTP use {@link createPartnerAiServiceApp}.
 */
export type PartnerAiService = {
  readonly app: PartnerAiServiceApp;
  readonly shutdown: () => Promise<void>;
};

/**
 * Create the service: composition, routes, and a background-lifecycle shutdown.
 *
 * This is where routes receive already-built dependencies. Route files should
 * parse requests and write responses, not rebuild policy, storage, or runtime
 * wiring.
 */
export const createPartnerAiService = (options: PartnerAiServiceOptions = {}): PartnerAiService => {
  const app = new Hono<AuthContextVariables>();
  const composition = composePartnerAiService(compositionOptions(options));
  // A custom verifier wins outright; otherwise the static-token adapter derived
  // from config is the dev/default authority.
  const authority = options.authVerifier ?? createServiceAuthVerifier(composition.auth);

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
  app.use("/tools", authContextMiddleware(authority), requireAuth());
  app.use("/chat/*", authContextMiddleware(authority), requireAuth());
  app.use("/usage", authContextMiddleware(authority), requireAuth());

  registerModelsRoute(app, composition.policies, composition.diagnostics.providerRegistryStatus);
  registerToolsRoute(app, composition.diagnostics.toolCatalog);
  registerChatHistoryRoutes(app, {
    repositories: composition.repositories,
    clock: composition.ports.clock,
  });
  registerChatUsageRoute(app, composition.repositories);
  // Start one turn (forks generation) and stream it on the same connection —
  // the response IS the turn's SSE stream, so it is owner-bound by construction.
  registerChatRunsRoute(app, {
    turnRunner: composition.turnRunner,
    ports: composition.ports,
    dispatcher: composition.dispatcher,
    safetyPollIntervalMs: composition.safetyPollIntervalMs,
    sseHeartbeatIntervalMs: composition.sseHeartbeatIntervalMs,
  });
  // ... then resolve, read status, subscribe to its durable event stream, and
  // cancel it. Composition already started the per-instance cancel listener
  // (`cancelDispatcher`) that interrupts an owned fiber when a cancel lands on
  // any instance; the cancel route only writes durable intent + notify.
  registerChatTurnRoutes(app, {
    repositories: composition.repositories,
    ports: composition.ports,
    dispatcher: composition.dispatcher,
    runner: composition.turnRunner,
    hostCommandResolver: composition.hostCommandResolver,
    safetyPollIntervalMs: composition.safetyPollIntervalMs,
    sseHeartbeatIntervalMs: composition.sseHeartbeatIntervalMs,
    observability: composition.observability,
  });
  // Subject-scoped live turn lifecycle, so the sidebar shows a "generating" dot on
  // every conversation with an in-flight turn — even ones not open.
  registerActivityRoutes(app, {
    repositories: composition.repositories,
    dispatcher: composition.activityDispatcher,
    sseHeartbeatIntervalMs: composition.sseHeartbeatIntervalMs,
  });

  return { app, shutdown: composition.shutdown };
};

export type PartnerAiServiceApp = Hono<AuthContextVariables>;

/**
 * Create just the Hono app, discarding the background-lifecycle shutdown.
 *
 * This is the convenience entry for HTTP tests and embedding contexts that do not
 * own process lifecycle; the long-running server uses {@link createPartnerAiService}
 * so it can shut the runner, reaper, and listeners down on SIGTERM.
 */
export const createPartnerAiServiceApp = (
  options: PartnerAiServiceOptions = {},
): PartnerAiServiceApp => createPartnerAiService(options).app;

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
  resumability: options.resumability,
});
