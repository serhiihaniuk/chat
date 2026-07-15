import { createHttpApp } from "#adapters/http/health/health-app";
import {
  createPostgresTurnActivityNotificationSource,
  createPostgresWorkflowJournalMaintenance,
  type ArchiveWorkflowJournal,
} from "@side-chat/db";
import { createChatRoutes } from "#adapters/http/chat/chat-routes";
import { createCapabilityRoutes } from "#adapters/http/capabilities/capability-routes";
import { createQueryRoutes } from "#adapters/http/conversations/query-routes";
import { createActivityRoutes } from "#adapters/http/conversations/activity-routes";
import { structuredPartCatalogsForServerTools } from "#application/conversations/read-conversation-history";
import { recordServiceTelemetry } from "#adapters/telemetry/ai-sdk-telemetry";
import {
  InMemoryTurnState,
  type SeedConversation,
} from "#adapters/persistence/in-memory-turn-state";
import {
  createPostgresTurnState,
  type PostgresTurnState,
} from "#adapters/persistence/postgres-turn-state";
import type { ConversationStore } from "#application/ports/turn/conversation-store";
import type { ConversationTitleStore } from "#application/ports/turn/title/conversation-title-store";
import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type {
  TurnCancellationStore,
  TurnExecutionClaimStore,
  TurnStore,
} from "#application/ports/turn/turn-store";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import type { TurnActivityNotificationSource } from "#application/ports/turn/activity/turn-activity-source";
import { createTurnActivityDispatcher } from "#application/turn/activity/turn-activity-dispatcher";
import {
  TOOL_APPROVAL_LOOKUP,
  type ToolApprovalDecisionStore,
} from "#application/ports/turn/tools/tool-approval-store";
import {
  CLIENT_TOOL_DISPATCH_LOOKUP,
  type ClientToolDispatchStore,
} from "#application/ports/turn/tools/client-tool-dispatch-store";
import type { Settings } from "#config/settings/resolve-settings";
import { configuredTurnModelCatalog } from "#application/turn/turn-model-policy";
import { selectRegisteredServerTools } from "#application/turn/tools/server-tools/registered-server-tools";
import { createScrubTransform } from "#application/turn/stream/scrub-filter";
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
import { PASS_THROUGH_TURN_ADMISSION } from "../turn/pass-through-admission.js";
import { createWorkflowTurnExecution } from "../turn/workflow-turn-execution.js";
import { createWorkflowTurnReplay } from "../turn/replay/workflow-turn-replay.js";
import { localChatConversation } from "./testing-harness/local-chat-fixture.js";
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
  const maintenanceStarters = createMaintenanceStarters(settings, options.archiveWorkflowJournal);
  // The persistence close is registered first so its pool is disposed even if a
  // later starter (telemetry, workflow readiness) fails during startup.
  const scope = await startServiceScope(settings, [
    persistence.registerClose,
    () => ({
      name: "turn activity dispatcher",
      close: () => activityDispatcher.shutdown(),
    }),
    ...maintenanceStarters.beforeTelemetry,
    startConfiguredTelemetry,
    ...maintenanceStarters.afterTelemetry,
    ...(options.starters ?? []),
  ]);
  const execution = createWorkflowTurnExecution(settings);
  const replay = createWorkflowTurnReplay();
  const app = createHttpApp(createWorkflowReadiness(scope, settings), authorizer);
  app.route(
    "/",
    createChatRoutes({
      turns: persistence.store,
      admission: PASS_THROUGH_TURN_ADMISSION,
      execution,
      replay,
      runAccess: persistence.store,
      clientToolDispatches: persistence.store,
      resumeClientTool: resumeClientToolResult,
      toolApprovals: persistence.store,
      resumeToolApproval,
      keepaliveIntervalMs: settings.keepalive.intervalMs,
      outboundTransforms: [() => createScrubTransform()],
      modelPolicy: configuredTurnModelCatalog(modelCatalog),
      serverToolNames: new Set(serverTools.map((definition) => definition.name)),
      hostContextPolicy: settings.hostContext,
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
    }),
  );
  return {
    app,
    modelProvider,
    scope,
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
    ],
  };
}

type ProductionPersistence = Readonly<{
  store: ConversationStore &
    ConversationQueryStore &
    ConversationTitleStore &
    TurnStore &
    TurnExecutionClaimStore &
    TurnCancellationStore &
    ClientToolDispatchStore &
    ToolApprovalDecisionStore &
    TurnRunAccess;
  registerClose: StartServicePart;
  activityNotificationSource: TurnActivityNotificationSource;
  /** True when the workflow finalize step owns terminal persistence (Postgres). */
  durable: boolean;
}>;

/**
 * Select the turn store from configuration.
 *
 * A configured `persistence.databaseUrl` selects real Postgres; its absence
 * falls back to the in-memory store (development only). The returned
 * `registerClose` is a scope starter that owns disposing the store's resources
 * on shutdown — a no-op for the in-memory store, the pool close for Postgres.
 */
function createProductionPersistence(settings: Settings): ProductionPersistence {
  const databaseUrl = settings.persistence.databaseUrl;
  if (databaseUrl === undefined) {
    if (settings.auth.profile === AUTH_PROFILES.PRODUCTION) {
      throw new Error("Production requires persistent Side Chat storage.");
    }
    const store = Object.assign(
      new InMemoryTurnState(productionConversations(settings)),
      unavailableClientToolDispatchStore,
      unavailableToolApprovalStore,
    );
    return {
      store,
      activityNotificationSource: store.turnActivityNotifications,
      durable: false,
      registerClose: () => ({
        name: "in-memory turn state",
        close: () => undefined,
      }),
    };
  }
  const store: PostgresTurnState = createPostgresTurnState(databaseUrl);
  return {
    store,
    activityNotificationSource: createPostgresTurnActivityNotificationSource(databaseUrl),
    durable: true,
    registerClose: () => ({
      name: "postgres turn state",
      close: () => store.close(),
    }),
  };
}

const unavailableClientToolDispatchStore: ClientToolDispatchStore = {
  findOwned: () => Promise.resolve(CLIENT_TOOL_DISPATCH_LOOKUP.NOT_FOUND),
  submit: () => Promise.reject(new Error("Client-tool dispatch persistence is unavailable")),
};

const unavailableToolApprovalStore: ToolApprovalDecisionStore = {
  findOwnedApproval: () => Promise.resolve(TOOL_APPROVAL_LOOKUP.NOT_FOUND),
  decideApproval: () => Promise.reject(new Error("Tool-approval persistence is unavailable")),
};

function productionConversations(settings: Settings): readonly SeedConversation[] {
  if (settings.auth.profile !== AUTH_PROFILES.DEVELOPMENT) return [];
  return [localChatConversation(settings.auth.workspaceId)];
}
