import type { TelemetryRecord, TelemetrySink } from "#application/ports/telemetry-sink";

import { recordTelemetrySafely } from "./record-telemetry-safely.js";

declare global {
  var SIDE_CHAT_PROCESS_TELEMETRY_SINK: TelemetrySink | undefined;
}

const NOOP_TELEMETRY_SINK: TelemetrySink = { record: () => undefined };

/** Install the process-local sink shared by route and Workflow bundle modules. */
export function installProcessTelemetrySink(sink: TelemetrySink): void {
  globalThis.SIDE_CHAT_PROCESS_TELEMETRY_SINK = sink;
}

/** Record best-effort service telemetry from any bundle loaded in this process. */
export function recordProcessTelemetry(record: TelemetryRecord): void {
  recordTelemetrySafely(globalThis.SIDE_CHAT_PROCESS_TELEMETRY_SINK ?? NOOP_TELEMETRY_SINK, record);
}
