import type { TelemetrySink } from "#application/ports/telemetry-sink";

/** Local diagnostics serialize only the content-free telemetry contract. */
export const consoleTelemetrySink: TelemetrySink = {
  record: (record) => console.info("[side-chat]", JSON.stringify(record)),
};
