import { createHttpApp } from "#adapters/http/health/health-app";
import {
  createPostgresWorkflowJournalMaintenance,
  type ArchiveWorkflowJournal,
} from "@side-chat/db";
import { createChatRoutes } from "#adapters/http/chat/chat-routes";
import { createQueryRoutes } from "#adapters/http/conversations/query-routes";
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
import type { MessageStore } from "#application/ports/turn/message-store";
import type { TurnStore } from "#application/ports/turn/turn-store";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import {
  CLIENT_TOOL_DISPATCH_LOOKUP,
  type ClientToolDispatchStore,
} from "#application/ports/turn/tools/client-tool-dispatch-store";
import type { Settings } from "#config/settings/resolve-settings";
import { configuredTurnModel } from "#application/turn/turn-model-policy";
import { createScrubTransform } from "#application/turn/stream/scrub-filter";
import {
  AUTH_PROFILES,
  WORKFLOW_JOURNAL_CLASSES,
} from "#config/declaration/side-chat-config";

import { assertAiSdkDefaultProviderIsUnset } from "../lifecycle/ai-sdk-global-guard.js";
import {
  startServiceScope,
  type StartServicePart,
} from "../lifecycle/resource-scope.js";
import { createWorkflowReadiness } from "../lifecycle/readiness/workflow-readiness.js";
import { createServiceAuthorizer } from "../auth/create-service-authorizer.js";
import { createProductionModelProvider } from "../providers/production-model-provider.js";
import { startConfiguredTelemetry } from "../lifecycle/telemetry/configured-telemetry.js";
import { startWorkflowJournalSweeper } from "../lifecycle/maintenance/workflow-journal-sweeper.js";
import { PASS_THROUGH_TURN_ADMISSION } from "../turn/pass-through-admission.js";
import { createWorkflowTurnExecution } from "../turn/workflow-turn-execution.js";
import { createWorkflowTurnReplay } from "../turn/replay/workflow-turn-replay.js";
import { localChatConversation } from "./testing-harness/local-chat-fixture.js";
import { productionConversationTitleWorkflowStarter } from "#workflows/production/conversation-title/generate-conversation-title";
import { resumeClientToolResult } from "#workflows/production/chat-turn";

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
  const authorizer = createServiceAuthorizer(settings.auth);
  const persistence = createProductionPersistence(settings);
  const maintenanceStarters = createMaintenanceStarters(
    settings,
    options.archiveWorkflowJournal,
  );
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
  const app = createHttpApp(
    createWorkflowReadiness(scope, settings),
    authorizer,
  );
  app.route(
    "/",
    createChatRoutes({
      messages: persistence.store,
      turns: persistence.store,
      admission: PASS_THROUGH_TURN_ADMISSION,
      execution,
      replay,
      runAccess: persistence.store,
      clientToolDispatches: persistence.store,
      resumeClientTool: resumeClientToolResult,
      keepaliveIntervalMs: settings.keepalive.intervalMs,
      outboundTransforms: [() => createScrubTransform()],
      selectModel: configuredTurnModel(settings.models.modelId),
      titleGeneration: {
        titles: persistence.store,
        workflow: productionConversationTitleWorkflowStarter,
        telemetry: { record: recordServiceTelemetry },
        modelId: settings.models.titleModelId,
        timeoutMs: settings.timeouts.titleMs,
        persistInWorkflow: settings.persistence.databaseUrl !== undefined,
      },
    }),
  );
  app.route(
    "/",
    createQueryRoutes({
      queries: persistence.store,
      telemetry: { record: recordServiceTelemetry },
      model: {
        id: settings.models.modelId,
        provider: settings.models.provider,
      },
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
  if (connectionString === undefined)
    return { beforeTelemetry: [], afterTelemetry: [] };
  if (
    settings.workflow.journalClass === WORKFLOW_JOURNAL_CLASSES.RECORD &&
    archiveWorkflowJournal === undefined
  ) {
    throw new Error(
      "Record-class Workflow journals require an immutable archive adapter.",
    );
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
    MessageStore &
    TurnStore &
    ClientToolDispatchStore &
    TurnRunAccess;
  registerClose: StartServicePart;
}>;

/**
 * Select the turn store from configuration.
 *
 * A configured `persistence.databaseUrl` selects real Postgres; its absence
 * falls back to the in-memory store (development only). The returned
 * `registerClose` is a scope starter that owns disposing the store's resources
 * on shutdown — a no-op for the in-memory store, the pool close for Postgres.
 */
function createProductionPersistence(
  settings: Settings,
): ProductionPersistence {
  const databaseUrl = settings.persistence.databaseUrl;
  if (databaseUrl === undefined) {
    if (settings.auth.profile === AUTH_PROFILES.PRODUCTION) {
      throw new Error("Production requires persistent Side Chat storage.");
    }
    const store = Object.assign(
      new InMemoryTurnState(productionConversations(settings)),
      unavailableClientToolDispatchStore,
    );
    return {
      store,
      registerClose: () => ({
        name: "in-memory turn state",
        close: () => undefined,
      }),
    };
  }
  const store: PostgresTurnState = createPostgresTurnState(databaseUrl);
  return {
    store,
    registerClose: () => ({
      name: "postgres turn state",
      close: () => store.close(),
    }),
  };
}

const unavailableClientToolDispatchStore: ClientToolDispatchStore = {
  findOwned: () => Promise.resolve(CLIENT_TOOL_DISPATCH_LOOKUP.NOT_FOUND),
  submit: () =>
    Promise.reject(
      new Error("Client-tool dispatch persistence is unavailable"),
    ),
};

function productionConversations(
  settings: Settings,
): readonly SeedConversation[] {
  if (settings.auth.profile !== AUTH_PROFILES.DEVELOPMENT) return [];
  return [localChatConversation(settings.auth.workspaceId)];
}
