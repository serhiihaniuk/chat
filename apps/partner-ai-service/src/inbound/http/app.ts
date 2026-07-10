import type {
  ObservabilitySinkPort,
  ConversationTitleGenerationPort,
  TurnGuardRegistryPort,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";
import type { AgentRuntime } from "@side-chat/agent-runtime";
import type { SidechatRepositories } from "@side-chat/db";
import { SILENT_DIAGNOSTIC_LOGGER, type DiagnosticLogger } from "@side-chat/shared";
import { Hono } from "hono";

import {
  createServiceAuthVerifier,
  type ServiceAuthConfig,
  type ServiceAuthVerifier,
} from "#adapters/auth/service-auth";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import { DEFAULT_TENANT_ID, DEFAULT_WORKSPACE_ID } from "#config/env/service-env-contract";
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
  tenantId: DEFAULT_TENANT_ID,
  workspaceId: DEFAULT_WORKSPACE_ID,
};

type PartnerAiServiceSharedOptions = {
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
  /**
   * Operational diagnostic logger for non-turn events (boot, config fallback,
   * LISTEN drops, shutdown). Config-driven boot installs a console logger by
   * profile; a programmatic embedder that omits it stays silent.
   */
  readonly diagnosticLogger?: DiagnosticLogger | undefined;
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

type ExplicitAuthorityOptions =
  | {
      readonly auth: ServiceAuthConfig;
      readonly authVerifier?: ServiceAuthVerifier | undefined;
    }
  | {
      readonly auth?: ServiceAuthConfig | undefined;
      readonly authVerifier: ServiceAuthVerifier;
    };

type ExplicitPersistenceOptions =
  | {
      readonly persistence: PersistenceConfig;
      readonly repositories?: SidechatRepositories | undefined;
    }
  | {
      readonly persistence?: PersistenceConfig | undefined;
      readonly repositories: SidechatRepositories;
    };

/**
 * Adopter-owned service construction contract.
 *
 * A host must deliberately choose workspace, authority, persistence, and runtime.
 * The explicit shape prevents copied starter code from silently retaining local
 * development identity, memory storage, or the fake provider in a deployment.
 */
export type PartnerAiServiceOptions = PartnerAiServiceSharedOptions &
  ExplicitAuthorityOptions &
  ExplicitPersistenceOptions & {
    readonly workspace: WorkspaceRef;
    readonly runtime: RuntimeConfig & RuntimeToolConfig;
  };

/** Optional overrides for the named local-development and test constructor. */
export type DevelopmentPartnerAiServiceOptions = PartnerAiServiceSharedOptions;

/**
 * A composed service: the Hono app plus its background-lifecycle shutdown.
 *
 * `shutdown` stops the generation runner, reaper, and `LISTEN` dispatchers the
 * composition started, so a long-running host (the Node server) can drain
 * cleanly on SIGTERM. Local HTTP tests use
 * {@link createDevelopmentPartnerAiServiceApp}.
 */
export type PartnerAiService = {
  readonly app: PartnerAiServiceApp;
  readonly shutdown: () => Promise<void>;
  /** Secret-free boot facts for the startup log line. */
  readonly diagnostics: {
    readonly providerId: string;
    readonly modelId: string;
    readonly persistenceLabel: string;
  };
};

/**
 * Create the service: composition, routes, and a background-lifecycle shutdown.
 *
 * This is where routes receive already-built dependencies. Route files should
 * parse requests and write responses, not rebuild policy, storage, or runtime
 * wiring.
 */
export const createPartnerAiService = (options: PartnerAiServiceOptions): PartnerAiService =>
  createPartnerAiServiceFromOptions(options);

/**
 * Create a local/test service with documented development fallbacks.
 *
 * Adopter boot should use {@link createPartnerAiService}; this entry point is
 * intentionally named so fake runtime, static dev auth, and memory persistence
 * cannot be mistaken for deployment-ready defaults.
 */
export const createDevelopmentPartnerAiService = (
  options: DevelopmentPartnerAiServiceOptions = {},
): PartnerAiService => createPartnerAiServiceFromOptions(options);

const createPartnerAiServiceFromOptions = (
  options: DevelopmentPartnerAiServiceOptions,
): PartnerAiService => {
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

  const guard = requireAuth(options.diagnosticLogger ?? SILENT_DIAGNOSTIC_LOGGER);
  app.use("/models", authContextMiddleware(authority), guard);
  app.use("/tools", authContextMiddleware(authority), guard);
  app.use("/chat/*", authContextMiddleware(authority), guard);
  app.use("/usage", authContextMiddleware(authority), guard);

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
    logger: options.diagnosticLogger ?? SILENT_DIAGNOSTIC_LOGGER,
  });
  // ... then resolve, read status, subscribe to its per-instance live stream, and
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

  return {
    app,
    shutdown: composition.shutdown,
    diagnostics: {
      providerId: composition.diagnostics.runtimeProviderId,
      modelId: composition.diagnostics.runtimeModelId,
      persistenceLabel: composition.diagnostics.persistenceLabel,
    },
  };
};

export type PartnerAiServiceApp = Hono<AuthContextVariables>;

/**
 * Create just the Hono app, discarding the background-lifecycle shutdown.
 *
 * This explicit adopter entry preserves the same dependency requirements as
 * {@link createPartnerAiService}. Hosts that own process lifecycle should use the
 * full constructor so they can stop the runner, reaper, and listeners on SIGTERM.
 */
export const createPartnerAiServiceApp = (options: PartnerAiServiceOptions): PartnerAiServiceApp =>
  createPartnerAiService(options).app;

/** Create only the Hono app with local-development and test fallbacks. */
export const createDevelopmentPartnerAiServiceApp = (
  options: DevelopmentPartnerAiServiceOptions = {},
): PartnerAiServiceApp => createDevelopmentPartnerAiService(options).app;

const compositionOptions = (
  options: DevelopmentPartnerAiServiceOptions,
): ServiceCompositionOptions => ({
  workspace: options.workspace ?? DEFAULT_WORKSPACE,
  auth: options.auth,
  policies: options.policies,
  persistence: options.persistence,
  repositories: options.repositories,
  runtime: options.runtime,
  agentRuntime: options.agentRuntime,
  conversationTitleGeneration: options.conversationTitleGeneration,
  observability: options.observability,
  diagnosticLogger: options.diagnosticLogger,
  capabilities: options.capabilities,
  turnProfiles: options.turnProfiles,
  defaultTurnProfileId: options.defaultTurnProfileId,
  turnGuards: options.turnGuards,
  turnGuardIds: options.turnGuardIds,
  resumability: options.resumability,
});
