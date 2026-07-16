import type { TelemetryRecord, TelemetrySink } from "#application/ports/telemetry-sink";

/** Instrumentation is observational: a broken sink must never change product behavior. */
export function recordTelemetrySafely(
  telemetry: Pick<TelemetrySink, "record">,
  record: TelemetryRecord,
): void {
  try {
    const pending = telemetry.record(record);
    void Promise.resolve(pending).catch(() => undefined);
  } catch {
    // A synchronous sink failure is contained for the same fail-open contract.
  }
}
