import {
  createPostgresTurnActivityNotificationSource,
  createPostgresTurnCancelNotificationSource,
  createPostgresTurnEventNotificationSource,
  NOOP_TURN_ACTIVITY_NOTIFICATION_SOURCE,
  NOOP_TURN_CANCEL_NOTIFICATION_SOURCE,
  NOOP_TURN_EVENT_NOTIFICATION_SOURCE,
  type TurnActivityNotificationSource,
  type TurnCancelNotificationSource,
  type TurnEventNotificationSource,
} from "@side-chat/db";
import { createNoopTurnGuardRegistry } from "#adapters/guards/noop-turn-guard-registry";
import { DEFAULT_SERVICE_CONVERSATION_TITLE_GENERATION } from "#config/sidechat-config/conversation-title";
import { createServiceTurnProfileBundle } from "./factories/create-service-turn-profile-bundle.js";
import { createServiceCapabilityBundle } from "./factories/create-service-capability-bundle.js";
import { createServiceContextBundle } from "./factories/create-service-context-bundle.js";
import { createServiceDiagnostics } from "./factories/create-service-diagnostics.js";
import { createServicePersistenceBundle } from "./factories/create-service-persistence-bundle.js";
import { createServiceProviderBundle } from "./factories/create-service-provider-bundle.js";
import { createServiceRuntimeBundle } from "./factories/create-service-runtime-bundle.js";
import { createServiceSecurityPorts } from "./factories/create-service-security-ports.js";
import { createServiceToolBundle } from "./factories/create-service-tool-bundle.js";
import { createStreamChatPorts } from "./factories/create-stream-chat-ports.js";
import { createTurnRunner } from "#inbound/turn-runner/turn-runner";
import { createTurnReaper } from "#inbound/turn-runner/maintenance/turn-reaper";
import { createTurnPruner } from "#inbound/turn-runner/maintenance/turn-pruner";
import { createTurnEventDispatcher } from "#inbound/turn-stream/turn-event-dispatcher";
import { createTurnCancelDispatcher } from "#inbound/turn-stream/turn-cancel-dispatcher";
import { createTurnActivityDispatcher } from "#inbound/turn-stream/activity/turn-activity-dispatcher";
import { resolveResumabilityConfig } from "./resumability-resolution.js";
import type {
  PersistenceConfig,
  ServiceComposition,
  ServiceCompositionOptions,
} from "./service-composition-types.js";

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

export type {
  OpenAIReasoningEffort,
  OpenAIReasoningSummary,
} from "@side-chat/agent-runtime";
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
} from "#composition/turn-profile/system-prompt-builder";
export type {
  BuiltSystemPrompt,
  SystemPromptBuilder,
  SystemPromptDefinition,
  SystemPromptSection,
} from "#composition/turn-profile/system-prompt-builder";

/**
 * Build the service graph used by HTTP routes.
 *
 * This is the app composition root: each factory turns configuration into one
 * named bundle, and construction reads top to bottom in dependency order. Routes
 * receive ready ports, status, and diagnostics instead of knowing how to
 * assemble core, runtime, and DB. Production call sites should pass explicit
 * adapters instead of relying on the development fallbacks each factory owns.
 */
export const composePartnerAiService = (
  options: ServiceCompositionOptions,
): ServiceComposition => {
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
  const runtime = createServiceRuntimeBundle(options, { providers, tools });
  const streamChat = createStreamChatPorts({
    persistence,
    capabilities,
    context,
    runtime,
    security,
    turnGuards,
    titleGeneration:
      options.conversationTitleGeneration ??
      DEFAULT_SERVICE_CONVERSATION_TITLE_GENERATION,
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
  });

  // The dispatcher is the local subscribe half of the resumable transport: it
  // consumes the db notification source (the only LISTEN connection) and fans
  // durable events out to per-instance SSE subscribers.
  const dispatcher = createTurnEventDispatcher({
    ports: streamChat.ports,
    notificationSource: createNotificationSource(persistence.persistence),
    observability: options.observability,
  });

  // The cancel dispatcher is the cross-instance half of cancel: it consumes the
  // db cancel notification source and interrupts the local generation fiber when
  // this instance owns the named turn (a no-op otherwise).
  const cancelDispatcher = createTurnCancelDispatcher({
    runner: turnRunner,
    notificationSource: createCancelNotificationSource(persistence.persistence),
  });

  // The activity dispatcher fans subject-scoped turn lifecycle out to the
  // `/chat/activity` SSE subscribers, so the sidebar shows a live "generating" dot
  // on every conversation with an in-flight turn. The notification carries the
  // full event, so this never reads the durable log.
  const activityDispatcher = createTurnActivityDispatcher({
    notificationSource: createActivityNotificationSource(persistence.persistence),
  });

  // The reaper is the dead/slow-owner backstop: on a fixed cadence it
  // terminalizes running turns whose lease expired (fencing the old owner) and
  // appends one synthetic terminal each, so a crashed instance's turns still reach
  // a durable terminal and close their subscribers.
  const reaper = createTurnReaper({
    repositories: persistence.repositories,
    clock: streamChat.ports.clock,
    ids: streamChat.ports.ids,
    reaperIntervalMs: resumability.reaperIntervalMs,
    batchLimit: resumability.reaperBatchLimit,
    observability: options.observability,
  });

  // The pruner is the turn_events retention backstop: on a fixed cadence it deletes
  // the now-redundant event log of long-terminal turns, keeping the consolidated
  // turn record and assistant message. A pruned turn falls back to conversation
  // history on resume (the stream route returns replay_expired).
  const pruner = createTurnPruner({
    repositories: persistence.repositories,
    clock: streamChat.ports.clock,
    retentionMs: resumability.turnEventRetentionMs,
    prunerIntervalMs: resumability.prunerIntervalMs,
    batchLimit: resumability.prunerBatchLimit,
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
    dispatcher,
    cancelDispatcher,
    activityDispatcher,
    reaper,
    pruner,
    observability: options.observability,
    capabilities: capabilities.capabilityStatus,
    diagnostics: createServiceDiagnostics({
      persistence,
      providers,
      tools,
      turnProfiles,
    }),
    safetyPollIntervalMs: resumability.safetyPollIntervalMs,
    // Interrupt generation first so its onExit finalizes each turn, then tear down
    // the recurring reaper/pruner sweeps and the two LISTEN dispatchers.
    shutdown: async () => {
      await turnRunner.shutdown();
      await Promise.all([
        reaper.shutdown(),
        pruner.shutdown(),
        cancelDispatcher.shutdown(),
        activityDispatcher.shutdown(),
        dispatcher.shutdown(),
      ]);
    },
  };
};

/**
 * Build the per-instance turn-event notification source for the dispatcher.
 *
 * Postgres persistence gets the dedicated `LISTEN` connection (the only one in
 * the system), reusing the same config-owned database URL. Memory persistence has
 * no cross-process wake signal, so it uses the no-op source and the subscriber
 * safety poll drives delivery from the in-memory log.
 */
const createNotificationSource = (
  persistence: PersistenceConfig,
): TurnEventNotificationSource =>
  persistence.kind === "postgres"
    ? createPostgresTurnEventNotificationSource(persistence.databaseUrl)
    : NOOP_TURN_EVENT_NOTIFICATION_SOURCE;

/**
 * Build the per-instance cancel notification source for the cancel dispatcher.
 *
 * Postgres persistence gets its own dedicated cancel `LISTEN` connection so a
 * cancel requested on another instance can interrupt the owning fiber. Memory
 * persistence has no cross-process wake signal, so it uses the no-op source; a
 * memory-backed cancel still interrupts in-process through the cancel route's
 * direct runner call.
 */
const createCancelNotificationSource = (
  persistence: PersistenceConfig,
): TurnCancelNotificationSource =>
  persistence.kind === "postgres"
    ? createPostgresTurnCancelNotificationSource(persistence.databaseUrl)
    : NOOP_TURN_CANCEL_NOTIFICATION_SOURCE;

/**
 * Build the per-instance turn-activity notification source for the dispatcher.
 *
 * Postgres persistence gets its own dedicated activity `LISTEN` connection. Memory
 * persistence has no cross-process wake signal, so it uses the no-op source: the
 * activity stream still serves its snapshot on connect, it just receives no live
 * transitions (mirrors the turn-event memory source).
 */
const createActivityNotificationSource = (
  persistence: PersistenceConfig,
): TurnActivityNotificationSource =>
  persistence.kind === "postgres"
    ? createPostgresTurnActivityNotificationSource(persistence.databaseUrl)
    : NOOP_TURN_ACTIVITY_NOTIFICATION_SOURCE;
