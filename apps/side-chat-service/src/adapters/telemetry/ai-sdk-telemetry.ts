import { registerTelemetry, type Telemetry } from "ai";

import type { TelemetrySink } from "#application/ports/telemetry-sink";

export class TelemetryRegistrationError extends Error {
  readonly code = "telemetry_already_registered";
}

export const PRIVATE_TELEMETRY_OPTIONS = {
  recordInputs: false,
  recordOutputs: false,
} as const;

export function registerServiceTelemetry(
  sink: TelemetrySink,
  additionalIntegrations: readonly Telemetry[] = [],
): void {
  if ((globalThis.AI_SDK_TELEMETRY_INTEGRATIONS?.length ?? 0) > 0) {
    throw new TelemetryRegistrationError(
      "AI SDK telemetry may be registered only once per process",
    );
  }
  registerTelemetry(createAiSdkTelemetry(sink), ...additionalIntegrations);
  void sink.record({ type: "service.boot" });
}

function createAiSdkTelemetry(sink: TelemetrySink): Telemetry {
  return {
    onStart: (event) =>
      sink.record({
        type: "ai.operation.start",
        operationId: event.operationId,
      }),
    onEnd: () => sink.record({ type: "ai.operation.end" }),
    onError: () => sink.record({ type: "ai.operation.error" }),
  };
}
