import { registerTelemetry, type Telemetry } from "ai";

import { PRIVATE_TELEMETRY_OPTIONS, type TelemetrySink } from "#application/ports/telemetry-sink";

let serviceTelemetrySink: TelemetrySink = { record: () => undefined };

export class TelemetryRegistrationError extends Error {
  readonly code = "telemetry_already_registered";
}

export { PRIVATE_TELEMETRY_OPTIONS };

export function registerServiceTelemetry(
  sink: TelemetrySink,
  additionalIntegrations: readonly Telemetry[] = [],
): void {
  if ((globalThis.AI_SDK_TELEMETRY_INTEGRATIONS?.length ?? 0) > 0) {
    throw new TelemetryRegistrationError(
      "AI SDK telemetry may be registered only once per process",
    );
  }
  serviceTelemetrySink = sink;
  registerTelemetry(createAiSdkTelemetry(sink), ...additionalIntegrations);
  void sink.record({ type: "service.boot" });
}

/** Record a bounded service event through the same sink registered for AI SDK events. */
export const recordServiceTelemetry: TelemetrySink["record"] = (record) =>
  serviceTelemetrySink.record(record);

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
