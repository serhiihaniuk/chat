import type { TelemetrySink } from "#application/ports/telemetry-sink";
import { recordTelemetrySafely } from "#application/telemetry/record-telemetry-safely";

export type ReconnectOutcome = "not_found" | "out_of_range" | "opened";

export function createChatKeepaliveObserver(telemetry: Pick<TelemetrySink, "record">): () => void {
  return () => {
    recordTelemetrySafely(telemetry, {
      type: "stream.keepalive",
      labels: { operation: "chat_stream" },
      count: 1,
    });
  };
}

export function recordReconnect(
  telemetry: Pick<TelemetrySink, "record">,
  outcomeTag: ReconnectOutcome,
): void {
  recordTelemetrySafely(telemetry, {
    type: "stream.reconnect",
    labels: { operation: "chat_stream_replay", outcomeTag },
    count: 1,
  });
}
