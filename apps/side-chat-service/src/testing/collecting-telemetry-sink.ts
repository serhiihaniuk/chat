import type { TelemetryRecord, TelemetrySink } from "#application/ports/telemetry-sink";

export type CollectingTelemetrySink = TelemetrySink & {
  readonly records: TelemetryRecord[];
};

export function createCollectingTelemetrySink(): CollectingTelemetrySink {
  const records: TelemetryRecord[] = [];
  return { records, record: (record) => void records.push(record) };
}
