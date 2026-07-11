import { createHttpApp } from "#adapters/http/health/health-app";
import { createChatRoutes } from "#adapters/http/chat/chat-routes";
import {
  InMemoryTurnState,
  type SeedConversation,
} from "#adapters/persistence/in-memory-turn-state";
import type { Settings } from "#config/settings/resolve-settings";
import { configuredTurnModel } from "#application/turn/turn-model-policy";
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
  const scope = await startServiceScope(settings, [startConfiguredTelemetry, ...starters]);
  const turnState = new InMemoryTurnState(productionConversations(settings));
  const execution = createWorkflowTurnExecution(settings);
  const app = createHttpApp(createWorkflowReadiness(scope, settings), authorizer);
  app.route(
    "/",
    createChatRoutes({
      messages: turnState,
      turns: turnState,
      admission: PASS_THROUGH_TURN_ADMISSION,
      execution,
      keepaliveIntervalMs: settings.keepalive.intervalMs,
      outboundTransforms: [],
      selectModel: configuredTurnModel(settings.models.modelId),
    }),
  );
  return {
    app,
    modelProvider,
    scope,
  };
}

function productionConversations(settings: Settings): readonly SeedConversation[] {
  if (settings.auth.profile !== AUTH_PROFILES.DEVELOPMENT) return [];
  return [localChatConversation(settings.auth.workspaceId)];
}
