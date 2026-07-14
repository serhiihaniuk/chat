import { createCompatibilityApp } from "#adapters/http/compatibility-app";
import { createChatRoutes } from "#adapters/http/chat/chat-routes";
import { createCapabilityRoutes } from "#adapters/http/capabilities/capability-routes";
import { createQueryRoutes } from "#adapters/http/conversations/query-routes";
import { EMPTY_STRUCTURED_PART_CATALOGS } from "#application/conversations/read-conversation-history";
import { createHttpApp, type Readiness } from "#adapters/http/health/health-app";
import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import {
  createPostgresTurnState,
  type PostgresTurnState,
} from "#adapters/persistence/postgres-turn-state";
import { registerServiceTelemetry } from "#adapters/telemetry/ai-sdk-telemetry";
import type { ModelProvider } from "#application/ports/model-provider";
import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { RequestAuthorizer } from "#application/ports/request-authorizer";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import type { TurnAdmission } from "#application/ports/turn/turn-admission";
import type { TurnExecution } from "#application/ports/turn/turn-execution";
import {
  CLIENT_TOOL_DISPATCH_LOOKUP,
  type ClientToolDispatchStore,
} from "#application/ports/turn/tools/client-tool-dispatch-store";
import type { ResumeClientTool } from "#application/turn/tools/submit-client-tool-output";
import {
  TOOL_APPROVAL_LOOKUP,
  type ToolApprovalDecisionStore,
} from "#application/ports/turn/tools/tool-approval-store";
import type { ResumeToolApproval } from "#application/turn/tools/approvals/submit-tool-approval";
import { TURN_REPLAY_RESULTS, type TurnReplay } from "#application/ports/turn/replay/turn-replay";
import { configuredTurnModelCatalog } from "#application/turn/turn-model-policy";
import type { ServerToolDefinition } from "#application/turn/tools/server-tools/server-tool-catalog";
import { selectRegisteredServerTools } from "#application/turn/tools/server-tools/registered-server-tools";
import { createScrubTransform } from "#application/turn/stream/scrub-filter";
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

const unavailableTurnReplay: TurnReplay = {
  open: () => Promise.resolve({ status: TURN_REPLAY_RESULTS.NOT_FOUND }),
};

const unavailableClientToolDispatches: ClientToolDispatchStore = {
  findOwned: () => Promise.resolve(CLIENT_TOOL_DISPATCH_LOOKUP.NOT_FOUND),
  submit: () => Promise.reject(new Error("Client-tool dispatch persistence is unavailable")),
};

const unavailableToolApprovals: ToolApprovalDecisionStore = {
  findOwnedApproval: () => Promise.resolve(TOOL_APPROVAL_LOOKUP.NOT_FOUND),
  decideApproval: () => Promise.reject(new Error("Tool-approval persistence is unavailable")),
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
  const persistence = inMemoryPersistence(
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
  const scope = await startServiceScope(settings, [persistence.registerClose, ...starters]);
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
      outboundTransforms: [() => createScrubTransform()],
      modelPolicy: configuredTurnModelCatalog(configuredModelCatalog(settings)),
      serverToolNames,
      hostContextPolicy: settings.hostContext,
      // In-memory dev has no durable workflow finalize; the route projects the
      // terminal itself. Postgres deployments leave it to the workflow step.
      ...(persistence.durable
        ? {}
        : { routeFinalization: { turns: turnState, messages: turnState } }),
    }),
  );
  app.route("/", createCapabilityRoutes({ hostContextPolicy: settings.hostContext }));
  app.route(
    "/",
    createQueryRoutes({
      queries: overrides.conversationQueries ?? turnState,
      telemetry: telemetrySink,
      modelCatalog: publishedModelCatalog(settings),
      structuredPartCatalogs: EMPTY_STRUCTURED_PART_CATALOGS,
      serverTools,
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

type TestingPersistence<TStore extends InMemoryTurnState | PostgresTurnState> = Readonly<{
  store: TStore;
  clientToolDispatches: ClientToolDispatchStore;
  toolApprovals: ToolApprovalDecisionStore;
  registerClose: StartServicePart;
  /** True when the workflow finalize step owns terminal persistence (Postgres). */
  durable: boolean;
}>;

function createConfiguredTestingPersistence(
  settings: Settings,
): TestingPersistence<InMemoryTurnState | PostgresTurnState> {
  const databaseUrl = settings.persistence.databaseUrl;
  if (databaseUrl === undefined) {
    return inMemoryPersistence(
      new InMemoryTurnState([localChatConversation(settings.auth.workspaceId)]),
    );
  }
  const store = createPostgresTurnState(databaseUrl);
  return {
    store,
    clientToolDispatches: store,
    toolApprovals: store,
    durable: true,
    registerClose: () => ({
      name: "postgres testing turn state",
      close: () => store.close(),
    }),
  };
}

function inMemoryPersistence(store: InMemoryTurnState): TestingPersistence<InMemoryTurnState> {
  return {
    store,
    clientToolDispatches: unavailableClientToolDispatches,
    toolApprovals: unavailableToolApprovals,
    durable: false,
    registerClose: () => ({
      name: "in-memory testing turn state",
      close: () => undefined,
    }),
  };
}
