import type { TelemetrySink } from "#application/ports/telemetry-sink";

/** Local diagnostics contain only bounded event names and operation ids. */
export const consoleTelemetrySink: TelemetrySink = {
  record: (record) => console.info("[side-chat]", record.type, record.operationId ?? ""),
};
