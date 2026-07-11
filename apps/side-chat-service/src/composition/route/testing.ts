import { createCompatibilityApp } from "#adapters/http/compatibility-app";
import { createChatRoutes } from "#adapters/http/chat/chat-routes";
import { createQueryRoutes } from "#adapters/http/conversations/query-routes";
import { createHttpApp, type Readiness } from "#adapters/http/health/health-app";
import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import { registerServiceTelemetry } from "#adapters/telemetry/ai-sdk-telemetry";
import type { ModelProvider } from "#application/ports/model-provider";
import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { RequestAuthorizer } from "#application/ports/request-authorizer";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import type { TurnAdmission } from "#application/ports/turn/turn-admission";
import type { TurnExecution } from "#application/ports/turn/turn-execution";
import { TURN_REPLAY_RESULTS, type TurnReplay } from "#application/ports/turn/replay/turn-replay";
import { configuredTurnModel, type TurnModelPolicy } from "#application/turn/turn-model-policy";
import { createScrubTransform } from "#application/turn/stream/scrub-filter";
import type { Settings } from "#config/settings/resolve-settings";
import { scriptedModelProvider } from "#testing/scripted-language-model";
import { DeterministicTurnAdmission } from "#testing/turn/deterministic-turn-admission";
import { DeterministicTurnExecution } from "#testing/turn/deterministic-turn-execution";

import { startServiceScope, type StartServicePart } from "../lifecycle/resource-scope.js";
import { createServiceAuthorizer } from "../auth/create-service-authorizer.js";
import { localChatConversation } from "./testing-harness/local-chat-fixture.js";

const unavailableTurnReplay: TurnReplay = {
  open: () => Promise.resolve({ status: TURN_REPLAY_RESULTS.NOT_FOUND }),
};

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
  }> = {},
) {
  if (overrides.telemetrySink !== undefined) registerServiceTelemetry(overrides.telemetrySink);
  const scope = await startServiceScope(settings, starters);
  const readiness = overrides.readiness ?? { check: () => scope.isReady() };
  const authorizer = overrides.authorizer ?? createServiceAuthorizer(settings.auth);
  const app = createHttpApp(readiness, authorizer);
  const turnState = overrides.turnState ?? defaultTurnState(settings);
  const telemetrySink = overrides.telemetrySink ?? { record: () => undefined };
  const turnExecution = overrides.turnExecution ?? new DeterministicTurnExecution();
  const turnReplay = resolveTurnReplay(overrides.turnReplay);
  app.route(
    "/",
    createChatRoutes({
      messages: turnState,
      turns: turnState,
      admission: overrides.turnAdmission ?? new DeterministicTurnAdmission(),
      execution: turnExecution,
      replay: turnReplay,
      runAccess: turnState,
      keepaliveIntervalMs: settings.keepalive.intervalMs,
      outboundTransforms: [() => createScrubTransform()],
      selectModel: testingTurnModelPolicy(settings),
    }),
  );
  app.route(
    "/",
    createQueryRoutes({
      queries: overrides.conversationQueries ?? turnState,
      telemetry: telemetrySink,
      model: { id: settings.models.modelId, provider: settings.models.provider },
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

function resolveTurnReplay(override: TurnReplay | undefined): TurnReplay {
  return override ?? unavailableTurnReplay;
}

function defaultTurnState(settings: Settings): InMemoryTurnState {
  return new InMemoryTurnState([localChatConversation(settings.auth.workspaceId)]);
}

function testingTurnModelPolicy(settings: Settings): TurnModelPolicy {
  if (settings.models.provider !== "scripted") {
    return configuredTurnModel(settings.models.modelId);
  }
  return (requested) => requested ?? settings.models.modelId;
}
