import { createHttpApp } from "#adapters/http/health/health-app";
import {
  BoundedTurnAdmission,
  TURN_ADMISSION_RELEASE_MODES,
} from "#adapters/capacity/bounded-turn-admission";
import {
  createPostgresWorkflowJournalMaintenance,
  type ArchiveWorkflowJournal,
} from "@side-chat/db";
import { createChatRoutes } from "#adapters/http/chat/chat-routes";
import { createCapabilityRoutes } from "#adapters/http/capabilities/capability-routes";
import { createQueryRoutes } from "#adapters/http/conversations/query-routes";
import { createActivityRoutes } from "#adapters/http/conversations/activity-routes";
import { ActiveStreamRegistry } from "#adapters/http/stream/active-stream-registry";
import { structuredPartCatalogsForServerTools } from "#application/conversations/read-conversation-history";
import { recordServiceTelemetry } from "#adapters/telemetry/ai-sdk-telemetry";
import { createTurnActivityDispatcher } from "#application/turn/activity/turn-activity-dispatcher";
import type { Settings } from "#config/settings/resolve-settings";
import { configuredTurnModelCatalog } from "#application/turn/turn-model-policy";
import { selectRegisteredServerTools } from "#application/turn/tools/server-tools/registered-server-tools";
import { createObservedScrubTransform } from "#application/telemetry/observed-scrub-transform";
import { AUTH_PROFILES, WORKFLOW_JOURNAL_CLASSES } from "#config/declaration/side-chat-config";

import { assertAiSdkDefaultProviderIsUnset } from "../lifecycle/ai-sdk-global-guard.js";
import { startServiceScope, type StartServicePart } from "../lifecycle/resource-scope.js";
import { createWorkflowReadiness } from "../lifecycle/readiness/workflow-readiness.js";
import { createServiceAuthorizer } from "../auth/create-service-authorizer.js";
import { createProductionModelProvider } from "../providers/production-model-provider.js";
import {
  configuredModelCatalog,
  publishedModelCatalog,
} from "../providers/configured-model-catalog.js";
import { startConfiguredTelemetry } from "../lifecycle/telemetry/configured-telemetry.js";
import { startWorkflowJournalSweeper } from "../lifecycle/maintenance/workflow-journal-sweeper.js";
import { startWorkflowStuckRunAlarm } from "../lifecycle/maintenance/workflow-stuck-run-alarm.js";
import { createWorkflowTurnExecution } from "../turn/workflow-turn-execution.js";
import { createWorkflowTurnReplay } from "../turn/replay/workflow-turn-replay.js";
import { createProductionPersistence } from "./persistence/production-persistence.js";
import { productionConversationTitleWorkflowStarter } from "#workflows/production/conversation-title/generate-conversation-title";
import { resumeClientToolResult } from "#workflows/production/chat-turn";
import { resumeToolApproval } from "#workflows/tool-approvals/index";

/** Production wiring contains no scripted providers or compatibility-only routes. */
export async function startProductionService(
  settings: Settings,
  options: Readonly<{
    starters?: readonly StartServicePart[] | undefined;
    archiveWorkflowJournal?: ArchiveWorkflowJournal | undefined;
  }> = {},
) {
  assertAiSdkDefaultProviderIsUnset();
  const modelProvider = createProductionModelProvider(settings);
  const modelCatalog = configuredModelCatalog(settings);
  const serverTools = selectRegisteredServerTools(settings.serverTools);
  const authorizer = createServiceAuthorizer(settings.auth);
  const persistence = createProductionPersistence(settings);
  const activityDispatcher = createTurnActivityDispatcher(persistence.activityNotificationSource);
  const activeStreams = new ActiveStreamRegistry();
  const maintenanceStarters = createMaintenanceStarters(settings, options.archiveWorkflowJournal);
  // The persistence close is registered first so its pool is disposed even if a
  // later starter (telemetry, workflow readiness) fails during startup.
  const scope = await startServiceScope(settings, [
    persistence.registerClose,
    ...maintenanceStarters.beforeTelemetry,
    startConfiguredTelemetry,
    ...maintenanceStarters.afterTelemetry,
    ...(options.starters ?? []),
  ]);
  const execution = createWorkflowTurnExecution(settings);
  const replay = createWorkflowTurnReplay();
  const admission = new BoundedTurnAdmission({
    ...settings.capacity,
    telemetry: { record: recordServiceTelemetry },
    releaseMode:
      settings.auth.profile === AUTH_PROFILES.DEVELOPMENT
        ? TURN_ADMISSION_RELEASE_MODES.STRICT
        : TURN_ADMISSION_RELEASE_MODES.IDEMPOTENT,
  });
  const app = createHttpApp(createWorkflowReadiness(scope, settings), authorizer);
  app.route(
    "/",
    createChatRoutes({
      turns: persistence.store,
      admission,
      execution,
      replay,
      runAccess: persistence.store,
      clientToolDispatches: persistence.store,
      resumeClientTool: resumeClientToolResult,
      toolApprovals: persistence.store,
      resumeToolApproval,
      keepaliveIntervalMs: settings.keepalive.intervalMs,
      outboundTransforms: [() => createObservedScrubTransform({ record: recordServiceTelemetry })],
      modelPolicy: configuredTurnModelCatalog(modelCatalog),
      serverToolNames: new Set(serverTools.map((definition) => definition.name)),
      hostContextPolicy: settings.hostContext,
      telemetry: { record: recordServiceTelemetry },
      activeStreams,
      // In-memory dev has no durable workflow finalize; the route projects the
      // terminal itself. Postgres deployments leave it to the workflow step.
      ...(persistence.durable
        ? {}
        : {
            routeFinalization: {
              turns: persistence.store,
            },
          }),
      titleGeneration: {
        titles: persistence.store,
        workflow: productionConversationTitleWorkflowStarter,
        telemetry: { record: recordServiceTelemetry },
        modelId: settings.conversationTitle.modelId,
        timeoutMs: settings.conversationTitle.timeoutMs,
        persistInWorkflow: settings.persistence.databaseUrl !== undefined,
      },
    }),
  );
  app.route("/", createCapabilityRoutes({ hostContextPolicy: settings.hostContext }));
  app.route(
    "/",
    createQueryRoutes({
      queries: persistence.store,
      telemetry: { record: recordServiceTelemetry },
      modelCatalog: publishedModelCatalog(settings),
      structuredPartCatalogs: structuredPartCatalogsForServerTools(serverTools),
      serverTools,
    }),
  );
  app.route(
    "/",
    createActivityRoutes({
      dispatcher: activityDispatcher,
      queries: persistence.store,
      keepaliveIntervalMs: settings.keepalive.intervalMs,
      telemetry: { record: recordServiceTelemetry },
      activeStreams,
    }),
  );
  return {
    app,
    modelProvider,
    admission,
    scope,
    closeStreams: async () => {
      await activeStreams.shutdown();
      await activityDispatcher.shutdown();
    },
  };
}

function createMaintenanceStarters(
  settings: Settings,
  archiveWorkflowJournal: ArchiveWorkflowJournal | undefined,
): Readonly<{
  beforeTelemetry: readonly StartServicePart[];
  afterTelemetry: readonly StartServicePart[];
}> {
  const connectionString = settings.workflow.postgresUrl;
  if (connectionString === undefined) return { beforeTelemetry: [], afterTelemetry: [] };
  if (
    settings.workflow.journalClass === WORKFLOW_JOURNAL_CLASSES.RECORD &&
    archiveWorkflowJournal === undefined
  ) {
    throw new Error("Record-class Workflow journals require an immutable archive adapter.");
  }
  const maintenance = createPostgresWorkflowJournalMaintenance({
    connectionString,
    archive:
      settings.workflow.journalClass === WORKFLOW_JOURNAL_CLASSES.RECORD
        ? archiveWorkflowJournal
        : undefined,
  });
  return {
    beforeTelemetry: [
      () => ({
        name: "workflow journal maintenance",
        close: () => maintenance.close(),
      }),
    ],
    afterTelemetry: [
      (serviceSettings) =>
        startWorkflowJournalSweeper(serviceSettings, maintenance, {
          record: recordServiceTelemetry,
        }),
      (serviceSettings) =>
        startWorkflowStuckRunAlarm(serviceSettings, maintenance, {
          record: recordServiceTelemetry,
        }),
    ],
  };
}
