import { createCompatibilityApp } from "#adapters/http/compatibility-app";
import { createChatRoutes } from "#adapters/http/chat/chat-routes";
import { createCapabilityRoutes } from "#adapters/http/capabilities/capability-routes";
import { createQueryRoutes } from "#adapters/http/conversations/query-routes";
import { createActivityRoutes } from "#adapters/http/conversations/activity-routes";
import { structuredPartCatalogsForServerTools } from "#application/conversations/read-conversation-history";
import { createHttpApp, type Readiness } from "#adapters/http/health/health-app";
import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import type { PostgresTurnState } from "#adapters/persistence/postgres-turn-state";
import { registerServiceTelemetry } from "#adapters/telemetry/ai-sdk-telemetry";
import type { ModelProvider } from "#application/ports/model-provider";
import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import { createTurnActivityDispatcher } from "#application/turn/activity/turn-activity-dispatcher";
import type { RequestAuthorizer } from "#application/ports/request-authorizer";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import type { TurnAdmission } from "#application/ports/turn/turn-admission";
import type { TurnExecution } from "#application/ports/turn/turn-execution";
import type { ClientToolDispatchStore } from "#application/ports/turn/tools/client-tool-dispatch-store";
import type { ResumeClientTool } from "#application/turn/tools/submit-client-tool-output";
import type { ToolApprovalDecisionStore } from "#application/ports/turn/tools/tool-approval-store";
import type { ResumeToolApproval } from "#application/turn/tools/approvals/submit-tool-approval";
import { TURN_REPLAY_RESULTS, type TurnReplay } from "#application/ports/turn/replay/turn-replay";
import { configuredTurnModelCatalog } from "#application/turn/turn-model-policy";
import type { ServerToolDefinition } from "#application/turn/tools/server-tools/server-tool-catalog";
import { selectRegisteredServerTools } from "#application/turn/tools/server-tools/registered-server-tools";
import { createObservedScrubTransform } from "#application/telemetry/observed-scrub-transform";
import type { Settings } from "#config/settings/resolve-settings";
import { scriptedModelProvider } from "#testing/scripted-language-model";
import { DeterministicTurnAdmission } from "#testing/turn/deterministic-turn-admission";
import { DeterministicTurnExecution } from "#testing/turn/deterministic-turn-execution";

import { startServiceScope, type StartServicePart } from "../lifecycle/resource-scope.js";
import {
  configuredModelCatalog,
  publishedModelCatalog,
} from "../providers/configured-model-catalog.js";
import { createServiceAuthorizer } from "../auth/create-service-authorizer.js";
import { localChatConversation } from "./testing-harness/local-chat-fixture.js";
import {
  createConfiguredTestingPersistence,
  createInMemoryTestingPersistence,
  type TestingPersistence,
} from "./persistence/testing-persistence.js";

const unavailableTurnReplay: TurnReplay = {
  open: () => Promise.resolve({ status: TURN_REPLAY_RESULTS.NOT_FOUND }),
};

function resolveServerTools(
  settings: Settings,
  serverTools: readonly ServerToolDefinition[] | undefined,
): readonly ServerToolDefinition[] {
  return serverTools ?? selectRegisteredServerTools(settings.serverTools);
}

export async function startTestingService(
  settings: Settings,
  starters: readonly StartServicePart[] = [],
  overrides: Readonly<{
    authorizer?: RequestAuthorizer;
    modelProvider?: ModelProvider;
    readiness?: Readiness;
    telemetrySink?: TelemetrySink;
    conversationQueries?: ConversationQueryStore;
    turnAdmission?: TurnAdmission;
    turnExecution?: TurnExecution;
    turnReplay?: TurnReplay;
    turnState?: InMemoryTurnState;
    clientToolDispatches?: ClientToolDispatchStore;
    resumeClientTool?: ResumeClientTool;
    toolApprovals?: ToolApprovalDecisionStore;
    resumeToolApproval?: ResumeToolApproval;
    serverTools?: readonly ServerToolDefinition[];
  }> = {},
) {
  const persistence = createInMemoryTestingPersistence(
    overrides.turnState ??
      new InMemoryTurnState([localChatConversation(settings.auth.workspaceId)]),
  );
  return startTestingServiceWithPersistence(settings, starters, overrides, persistence);
}

/** Compiled DB tests opt into configured Postgres without changing the in-process harness. */
export async function startTestingServiceWithConfiguredPersistence(
  settings: Settings,
  starters: readonly StartServicePart[] = [],
  overrides: Readonly<{
    authorizer?: RequestAuthorizer;
    modelProvider?: ModelProvider;
    readiness?: Readiness;
    telemetrySink?: TelemetrySink;
    conversationQueries?: ConversationQueryStore;
    turnAdmission?: TurnAdmission;
    turnExecution?: TurnExecution;
    turnReplay?: TurnReplay;
    clientToolDispatches?: ClientToolDispatchStore;
    resumeClientTool?: ResumeClientTool;
    toolApprovals?: ToolApprovalDecisionStore;
    resumeToolApproval?: ResumeToolApproval;
    serverTools?: readonly ServerToolDefinition[];
  }> = {},
) {
  return startTestingServiceWithPersistence(
    settings,
    starters,
    overrides,
    createConfiguredTestingPersistence(settings),
  );
}

async function startTestingServiceWithPersistence<
  TStore extends InMemoryTurnState | PostgresTurnState,
>(
  settings: Settings,
  starters: readonly StartServicePart[],
  overrides: Readonly<{
    authorizer?: RequestAuthorizer;
    modelProvider?: ModelProvider;
    readiness?: Readiness;
    telemetrySink?: TelemetrySink;
    conversationQueries?: ConversationQueryStore;
    turnAdmission?: TurnAdmission;
    turnExecution?: TurnExecution;
    turnReplay?: TurnReplay;
    clientToolDispatches?: ClientToolDispatchStore;
    resumeClientTool?: ResumeClientTool;
    toolApprovals?: ToolApprovalDecisionStore;
    resumeToolApproval?: ResumeToolApproval;
    serverTools?: readonly ServerToolDefinition[];
  }>,
  persistence: TestingPersistence<TStore>,
) {
  if (overrides.telemetrySink !== undefined) registerServiceTelemetry(overrides.telemetrySink);
  const activityDispatcher = createTurnActivityDispatcher(persistence.activityNotificationSource);
  const scope = await startServiceScope(settings, [
    persistence.registerClose,
    () => ({
      name: "testing turn activity dispatcher",
      close: () => activityDispatcher.shutdown(),
    }),
    ...starters,
  ]);
  const readiness = overrides.readiness ?? { check: () => scope.isReady() };
  const authorizer = overrides.authorizer ?? createServiceAuthorizer(settings.auth);
  const app = createHttpApp(readiness, authorizer);
  const turnState = persistence.store;
  const telemetrySink = overrides.telemetrySink ?? { record: () => undefined };
  const turnExecution = overrides.turnExecution ?? new DeterministicTurnExecution();
  const serverTools = resolveServerTools(settings, overrides.serverTools);
  const serverToolNames = new Set(serverTools.map((definition) => definition.name));
  const turnReplay = resolveTurnReplay(overrides.turnReplay);
  const approvalDependencies = testingApprovalDependencies(overrides, persistence);
  const conversationQueries = overrides.conversationQueries ?? turnState;
  app.route(
    "/",
    createChatRoutes({
      turns: turnState,
      admission: overrides.turnAdmission ?? new DeterministicTurnAdmission(),
      execution: turnExecution,
      replay: turnReplay,
      runAccess: turnState,
      clientToolDispatches: overrides.clientToolDispatches ?? persistence.clientToolDispatches,
      resumeClientTool: overrides.resumeClientTool ?? (() => Promise.resolve(false)),
      ...approvalDependencies,
      keepaliveIntervalMs: settings.keepalive.intervalMs,
      outboundTransforms: [() => createObservedScrubTransform(telemetrySink)],
      modelPolicy: configuredTurnModelCatalog(configuredModelCatalog(settings)),
      serverToolNames,
      hostContextPolicy: settings.hostContext,
      telemetry: telemetrySink,
      // In-memory dev has no durable workflow finalize; the route projects the
      // terminal itself. Postgres deployments leave it to the workflow step.
      ...(persistence.durable ? {} : { routeFinalization: { turns: turnState } }),
    }),
  );
  app.route("/", createCapabilityRoutes({ hostContextPolicy: settings.hostContext }));
  app.route(
    "/",
    createQueryRoutes({
      queries: conversationQueries,
      telemetry: telemetrySink,
      modelCatalog: publishedModelCatalog(settings),
      structuredPartCatalogs: structuredPartCatalogsForServerTools(serverTools),
      serverTools,
    }),
  );
  app.route(
    "/",
    createActivityRoutes({
      dispatcher: activityDispatcher,
      queries: conversationQueries,
      keepaliveIntervalMs: settings.keepalive.intervalMs,
      telemetry: telemetrySink,
    }),
  );
  app.route("/", createCompatibilityApp());
  return {
    app,
    modelProvider: overrides.modelProvider ?? scriptedModelProvider,
    turnExecution,
    turnState,
    scope,
  };
}

function testingApprovalDependencies(
  overrides: Readonly<{
    toolApprovals?: ToolApprovalDecisionStore;
    resumeToolApproval?: ResumeToolApproval;
  }>,
  persistence: Readonly<{ toolApprovals: ToolApprovalDecisionStore }>,
) {
  return {
    toolApprovals: overrides.toolApprovals ?? persistence.toolApprovals,
    resumeToolApproval: overrides.resumeToolApproval ?? (() => Promise.resolve(false)),
  };
}

function resolveTurnReplay(override: TurnReplay | undefined): TurnReplay {
  return override ?? unavailableTurnReplay;
}
