import type { Readiness } from "#adapters/http/health/health-app";
import type { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { ModelProvider } from "#application/ports/model-provider";
import type { RequestAuthorizer, ServerToolDefinition } from "@side-chat/side-chat-server";
import type { TurnAdmission } from "#application/ports/turn/turn-admission";
import type { TurnExecution } from "#application/ports/turn/turn-execution";
import type { TurnReplay } from "#application/ports/turn/replay/turn-replay";
import type { ClientToolDispatchStore } from "#application/ports/turn/tools/client-tool-dispatch-store";
import type { ResumeClientTool } from "#application/turn/tools/submit-client-tool-output";
import type { ToolApprovalDecisionStore } from "#application/ports/turn/tools/tool-approval-store";
import type { ResumeToolApproval } from "#application/turn/tools/approvals/submit-tool-approval";
import type { SideChatConfig } from "#config/declaration/side-chat-config";
import { validateSettings } from "#config/settings/resolve-settings";
import { createDefaultConfig } from "#config/settings/settings.test-fixture";
import { createCollectingTelemetrySink } from "#testing/collecting-telemetry-sink";

import { startTestingService } from "../testing.js";

const TEST_TOKEN = "local-test-token";

/** In-process route-composition harness; compiled Workflow physics stay in their separate suite. */
export async function createServiceTestHarness(
  overrides: {
    readonly authorizer?: RequestAuthorizer;
    readonly modelProvider?: ModelProvider;
    readonly readiness?: Readiness;
    readonly turnAdmission?: TurnAdmission;
    readonly turnExecution?: TurnExecution;
    readonly turnReplay?: TurnReplay;
    readonly turnState?: InMemoryTurnState;
    readonly conversationQueries?: ConversationQueryStore;
    readonly clientToolDispatches?: ClientToolDispatchStore;
    readonly resumeClientTool?: ResumeClientTool;
    readonly toolApprovals?: ToolApprovalDecisionStore;
    readonly resumeToolApproval?: ResumeToolApproval;
    readonly serverTools?: readonly ServerToolDefinition[];
    readonly models?: SideChatConfig["models"];
    readonly hostContext?: Partial<SideChatConfig["hostContext"]>;
  } = {},
) {
  const { hostContext, models, ...serviceOverrides } = overrides;
  const settingsResult = validateSettings(
    createDefaultConfig({
      ...(hostContext === undefined ? {} : { hostContext }),
      ...(models === undefined ? {} : { models }),
    }),
  );
  if (!settingsResult.ok) throw new Error("Default test settings must be valid");
  const previousTelemetry = globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;
  globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
  const telemetry = createCollectingTelemetrySink();
  const service = await startTestingService(settingsResult.settings, [], {
    ...serviceOverrides,
    telemetrySink: telemetry,
  });
  const request = (path: string, init: RequestInit = {}) =>
    service.app.request(path, {
      ...init,
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        ...headersOf(init.headers),
      },
    });
  return {
    ...service,
    telemetry,
    request,
    unauthenticatedRequest: (path: string, init?: RequestInit) => service.app.request(path, init),
    close: async () => {
      await service.closeStreams();
      await service.scope.close();
      globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = previousTelemetry;
    },
  };
}

function headersOf(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}
