import { SILENT_DIAGNOSTIC_LOGGER } from "@side-chat/shared";
import { createNoopTurnGuardRegistry } from "#adapters/guards/noop-turn-guard-registry";
import { createInMemoryTurnEventLog } from "#adapters/persistence/turn-events/in-memory-turn-event-log";
import { createHostCommandResultDispatcher } from "#adapters/host-commands/host-command-result-dispatcher";
import {
  createServiceHostCommandResolver,
  DEFAULT_HOST_COMMAND_RESULT_TIMEOUT_MS,
} from "#adapters/host-commands/service-host-command-resolver";
import { DEFAULT_SERVICE_CONVERSATION_TITLE_GENERATION } from "#config/sidechat-config/conversation-title";
import { createServiceTurnProfileBundle } from "./turn-profile/create-service-turn-profile-bundle.js";
import { createServiceCapabilityBundle } from "./capabilities/create-service-capability-bundle.js";
import { createServiceContextBundle } from "./context/create-service-context-bundle.js";
import { createServiceDiagnostics } from "./diagnostics/create-service-diagnostics.js";
import { createServicePersistenceBundle } from "./persistence/create-service-persistence-bundle.js";
import {
  createActivityNotificationSource,
  createCancelNotificationSource,
  createHostCommandResultNotificationSource,
} from "./persistence/notification-sources.js";
import { createServiceProviderBundle } from "./providers/create-service-provider-bundle.js";
import { createServiceRuntimeBundle } from "./runtime/create-service-runtime-bundle.js";
import { createServiceSecurityPorts } from "./security/create-service-security-ports.js";
import { createServiceToolBundle } from "./tools/create-service-tool-bundle.js";
import { createStreamChatPorts, systemClock } from "./ports/create-stream-chat-ports.js";
import { createTurnReaper } from "#inbound/turn-runner/maintenance/turn-reaper";
import { createTurnRunner } from "#inbound/turn-runner/turn-runner";
import { createTurnCancelDispatcher } from "#inbound/turn-stream/turn-cancel-dispatcher";
import { createTurnActivityDispatcher } from "#inbound/turn-stream/activity/turn-activity-dispatcher";
import { resolveResumabilityConfig } from "./runtime/resumability-resolution.js";
import type { ServiceComposition, ServiceCompositionOptions } from "./service-composition-types.js";

export type {
  PersistenceConfig,
  ResumabilityConfig,
  ResumabilityOptions,
  RuntimeConfig,
  RuntimeModelMetadata,
  RuntimeToolConfig,
  ServiceComposition,
  ServiceCompositionOptions,
} from "./service-composition-types.js";

export type { OpenAIReasoningEffort, OpenAIReasoningSummary } from "@side-chat/agent-runtime";
export {
  createServiceProviderRegistry,
  SERVICE_MODEL_RETENTION_POLICIES,
  ServiceProviderRegistryError,
} from "#composition/providers/service-provider-registry";
export type {
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
  createTurnProfileRegistry,
  TurnProfileRegistryError,
} from "#composition/turn-profile/turn-profile-registry";
export type {
  TurnProfileRegistry,
  ServiceTurnProfileConfig,
  ServiceTurnProfile,
} from "#composition/turn-profile/turn-profile-registry";
export {
  createDefaultTurnProfileConfig,
  DEFAULT_TURN_PROFILE_ID,
  DEFAULT_TURN_PROFILE_SYSTEM_PROMPT_ID,
} from "#composition/turn-profile/default-turn-profile-config";
export {
  createDefaultSystemPromptBuilder,
  SystemPromptBuilderError,
} from "#composition/turn-profile/prompt/system-prompt-builder";
export type {
  BuiltSystemPrompt,
  SystemPromptBuilder,
  SystemPromptDefinition,
  SystemPromptSection,
} from "#composition/turn-profile/prompt/system-prompt-builder";

/**
 * Build the service graph used by HTTP routes.
 *
 * This is the app composition root: each factory turns configuration into one
 * named bundle, and construction reads top to bottom in dependency order. Routes
 * receive ready ports, status, and diagnostics instead of knowing how to
 * assemble core, runtime, and DB. Production call sites should pass explicit
 * adapters instead of relying on the development fallbacks each factory owns.
 */
export const composePartnerAiService = (options: ServiceCompositionOptions): ServiceComposition => {
  const logger = options.diagnosticLogger ?? SILENT_DIAGNOSTIC_LOGGER;
  const turnGuards = options.turnGuards ?? createNoopTurnGuardRegistry();

  const security = createServiceSecurityPorts(options);
  const persistence = createServicePersistenceBundle(options, security);
  const providers = createServiceProviderBundle(options);
  const tools = createServiceToolBundle(options);
  const turnProfiles = createServiceTurnProfileBundle(options, {
    providers: providers.registry,
    tools: tools.registry,
    turnGuardIds: options.turnGuardIds ?? [],
    registeredGuardIds: turnGuards.guards.map((guard) => guard.guardId),
  });
  const capabilities = createServiceCapabilityBundle(options, {
    turnProfiles: turnProfiles.registry,
    providers: providers.registry,
    tools: tools.registry,
    persistence,
  });
  const context = createServiceContextBundle(options, {
    repositories: persistence.repositories,
  });
  // The in-memory turn-event registry is created here (not inside createStreamChatPorts)
  // so the host-command resolver can read its live-subscriber state and the runtime is
  // built with that resolver before the ports/dispatcher are assembled from it.
  const turnEventLog = createInMemoryTurnEventLog();
  const hostCommandResolver = createServiceHostCommandResolver({
    hasConnectedClient: (assistantTurnId) => turnEventLog.hasSubscribers(assistantTurnId),
    timeoutMs: DEFAULT_HOST_COMMAND_RESULT_TIMEOUT_MS,
    // The durable half of the result relay (ADR 0009): the resolver persists the
    // `emitted` row that binds commandId to turn, and its result poll reads the
    // persisted answer even if the NOTIFY signal is lost.
    repositories: persistence.repositories,
    workspaceId: options.workspace.workspaceId,
    clock: systemClock,
    logger,
  });
  const runtime = createServiceRuntimeBundle(options, { providers, tools, hostCommandResolver });
  // Complete the tools-before-runtime construction cycle. Each tool registry owns
  // this handle, so reusing one immutable registration across service compositions
  // cannot redirect an older composition's sub-agent tools to a newer runtime.
  tools.registry.bindRuntime(runtime.runtime);
  const streamChat = createStreamChatPorts({
    persistence,
    capabilities,
    context,
    runtime,
    security,
    turnGuards,
    turnEventLog,
    titleGeneration:
      options.conversationTitleGeneration ?? DEFAULT_SERVICE_CONVERSATION_TITLE_GENERATION,
    turnActivityHistory: options.turnActivityHistory,
    observability: options.observability,
  });

  const resumability = resolveResumabilityConfig(options.resumability);

  const turnRunner = createTurnRunner({
    workspace: options.workspace,
    hostAppId: capabilities.manifest.hostAppId,
    ports: streamChat.ports,
    // The forked generation heartbeats this lease and self-interrupts if fenced.
    lease: {
      instanceId: resumability.instanceId,
      leaseTtlMs: resumability.leaseTtlMs,
      heartbeatIntervalMs: resumability.heartbeatIntervalMs,
    },
    logger,
  });

  // The reaper is the crash backstop (ADR 0008): a hard-killed owner cannot
  // finalize its turns, so every instance periodically terminalizes dead-owner
  // running turns (expired lease, or NULL lease past 2x the TTL for a crash in
  // the insert-to-acquire window). Concurrent sweeps claim disjoint rows.
  const turnReaper = createTurnReaper({
    repositories: persistence.repositories,
    clock: streamChat.ports.clock,
    reaperIntervalMs: resumability.reaperIntervalMs,
    batchLimit: resumability.reaperBatchLimit,
    nullLeaseGraceMs: 2 * resumability.leaseTtlMs,
    observability: options.observability,
  });

  // The dispatcher is the same per-instance in-memory registry that backs
  // ports.turnEventLog: core appends events to it and the SSE route subscribes to
  // it, so the live stream is a direct in-memory fan-out (no durable log, no NOTIFY).
  const dispatcher = streamChat.turnEventLog;

  // The cancel dispatcher is the cross-instance half of cancel: it consumes the
  // db cancel notification source and interrupts the local generation fiber when
  // this instance owns the named turn (a no-op otherwise).
  const cancelDispatcher = createTurnCancelDispatcher({
    runner: turnRunner,
    notificationSource: createCancelNotificationSource(
      persistence.persistence,
      persistence.repositories,
      logger,
    ),
  });

  // The activity dispatcher fans subject-scoped turn lifecycle out to the
  // `/chat/activity` SSE subscribers, so the sidebar shows a live "generating" dot
  // on every conversation with an in-flight turn. The notification carries the
  // full event, so no persistence read is needed per signal.
  const activityDispatcher = createTurnActivityDispatcher({
    notificationSource: createActivityNotificationSource(persistence.persistence, logger),
  });

  // The result dispatcher is the cross-instance half of the host-command relay:
  // a result POSTed to another instance is persisted + NOTIFYed there, and this
  // listener settles the local paused tool loop promptly (the resolver's result
  // poll is the missed-signal backstop).
  const hostCommandResultDispatcher = createHostCommandResultDispatcher({
    resolver: hostCommandResolver,
    repositories: persistence.repositories,
    workspaceId: options.workspace.workspaceId,
    notificationSource: createHostCommandResultNotificationSource(persistence.persistence, logger),
  });

  return {
    workspace: options.workspace,
    hostAppId: capabilities.manifest.hostAppId,
    auth: security.auth,
    policies: security.policies,
    persistence: persistence.persistence,
    repositories: persistence.repositories,
    runtime: runtime.runtime,
    ports: streamChat.ports,
    turnRunner,
    turnReaper,
    dispatcher,
    hostCommandResolver,
    cancelDispatcher,
    activityDispatcher,
    observability: options.observability,
    capabilities: capabilities.capabilityStatus,
    diagnostics: createServiceDiagnostics({
      persistence,
      providers,
      tools,
      turnProfiles,
    }),
    safetyPollIntervalMs: resumability.safetyPollIntervalMs,
    sseHeartbeatIntervalMs: resumability.sseHeartbeatIntervalMs,
    // Interrupt generation first so its onExit finalizes each turn, then tear down
    // the reaper sweep, the LISTEN dispatchers, and the in-memory event registry.
    shutdown: async () => {
      await turnRunner.shutdown();
      await Promise.all([
        turnReaper.shutdown(),
        cancelDispatcher.shutdown(),
        activityDispatcher.shutdown(),
        hostCommandResultDispatcher.shutdown(),
        dispatcher.shutdown(),
      ]);
    },
  };
};
