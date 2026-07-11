import { createHttpApp } from "#adapters/http/health/health-app";
import { createChatRoutes } from "#adapters/http/chat/chat-routes";
import {
  InMemoryTurnState,
  type SeedConversation,
} from "#adapters/persistence/in-memory-turn-state";
import {
  createPostgresTurnState,
  type PostgresTurnState,
} from "#adapters/persistence/postgres-turn-state";
import type { ConversationStore } from "#application/ports/turn/conversation-store";
import type { MessageStore } from "#application/ports/turn/message-store";
import type { TurnStore } from "#application/ports/turn/turn-store";
import type { Settings } from "#config/settings/resolve-settings";
import { configuredTurnModel } from "#application/turn/turn-model-policy";
import { createScrubTransform } from "#application/turn/stream/scrub-filter";
import { AUTH_PROFILES } from "#config/declaration/side-chat-config";

import { assertAiSdkDefaultProviderIsUnset } from "../lifecycle/ai-sdk-global-guard.js";
import { startServiceScope, type StartServicePart } from "../lifecycle/resource-scope.js";
import { createWorkflowReadiness } from "../lifecycle/readiness/workflow-readiness.js";
import { createServiceAuthorizer } from "../auth/create-service-authorizer.js";
import { createProductionModelProvider } from "../providers/production-model-provider.js";
import { startConfiguredTelemetry } from "../lifecycle/telemetry/configured-telemetry.js";
import { PASS_THROUGH_TURN_ADMISSION } from "../turn/pass-through-admission.js";
import { createWorkflowTurnExecution } from "../turn/workflow-turn-execution.js";
import { localChatConversation } from "./testing-harness/local-chat-fixture.js";

/** Production wiring contains no scripted providers or compatibility-only routes. */
export async function startProductionService(
  settings: Settings,
  starters: readonly StartServicePart[] = [],
) {
  assertAiSdkDefaultProviderIsUnset();
  const modelProvider = createProductionModelProvider(settings);
  const authorizer = createServiceAuthorizer(settings.auth);
  const persistence = createProductionPersistence(settings);
  // The persistence close is registered first so its pool is disposed even if a
  // later starter (telemetry, workflow readiness) fails during startup.
  const scope = await startServiceScope(settings, [
    persistence.registerClose,
    startConfiguredTelemetry,
    ...starters,
  ]);
  const execution = createWorkflowTurnExecution(settings);
  const app = createHttpApp(createWorkflowReadiness(scope, settings), authorizer);
  app.route(
    "/",
    createChatRoutes({
      messages: persistence.store,
      turns: persistence.store,
      admission: PASS_THROUGH_TURN_ADMISSION,
      execution,
      keepaliveIntervalMs: settings.keepalive.intervalMs,
      outboundTransforms: [() => createScrubTransform()],
      selectModel: configuredTurnModel(settings.models.modelId),
    }),
  );
  return {
    app,
    modelProvider,
    scope,
  };
}

type ProductionPersistence = Readonly<{
  store: ConversationStore & MessageStore & TurnStore;
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
function createProductionPersistence(settings: Settings): ProductionPersistence {
  const databaseUrl = settings.persistence.databaseUrl;
  if (databaseUrl === undefined) {
    const store = new InMemoryTurnState(productionConversations(settings));
    return {
      store,
      registerClose: () => ({ name: "in-memory turn state", close: () => undefined }),
    };
  }
  const store: PostgresTurnState = createPostgresTurnState(databaseUrl);
  return {
    store,
    registerClose: () => ({ name: "postgres turn state", close: () => store.close() }),
  };
}

function productionConversations(settings: Settings): readonly SeedConversation[] {
  if (settings.auth.profile !== AUTH_PROFILES.DEVELOPMENT) return [];
  return [localChatConversation(settings.auth.workspaceId)];
}
