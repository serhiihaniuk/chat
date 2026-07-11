import { registerServiceTelemetry } from "#adapters/telemetry/ai-sdk-telemetry";
import { consoleTelemetrySink } from "#adapters/telemetry/console-telemetry-sink";
import { createOtlpTelemetry, type OtlpTelemetry } from "#adapters/telemetry/otlp-telemetry";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import type { Settings } from "#config/settings/resolve-settings";

import type { StartedServicePart } from "../resource-scope.js";

const silentTelemetrySink: TelemetrySink = { record: () => undefined };

/** Start the selected process-wide telemetry integration as a scoped resource. */
export async function startConfiguredTelemetry(
  settings: Settings,
  loadOtlp: OtlpTelemetryLoader = createOtlpTelemetry,
): Promise<StartedServicePart> {
  if (settings.telemetry.mode === "off") return noTelemetryPart();
  if (settings.telemetry.mode === "console") {
    registerServiceTelemetry(consoleTelemetrySink);
    return { name: "console telemetry", close: () => undefined };
  }

  const otlp = await loadOtlp(settings.telemetry);
  try {
    registerServiceTelemetry(silentTelemetrySink, [otlp.integration]);
  } catch (error) {
    await otlp.close();
    throw error;
  }
  return { name: "OTLP telemetry", close: otlp.close };
}

function noTelemetryPart(): StartedServicePart {
  return { name: "telemetry disabled", close: () => undefined };
}

export type OtlpTelemetryLoader = (options: {
  readonly endpoint: string;
  readonly serviceName: string;
}) => Promise<OtlpTelemetry>;
