import type { Readiness } from "#adapters/http/health/health-app";
import type { ModelProvider } from "#application/ports/model-provider";
import type { RequestAuthorizer } from "#application/ports/request-authorizer";
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
  } = {},
) {
  const settingsResult = validateSettings(createDefaultConfig());
  if (!settingsResult.ok) throw new Error("Default test settings must be valid");
  const previousTelemetry = globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;
  globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
  const telemetry = createCollectingTelemetrySink();
  const service = await startTestingService(settingsResult.settings, [], {
    ...overrides,
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
      await service.scope.close();
      globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = previousTelemetry;
    },
  };
}

function headersOf(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}
