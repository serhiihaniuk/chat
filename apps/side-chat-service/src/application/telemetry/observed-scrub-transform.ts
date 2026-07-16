import type { UIMessageChunk } from "ai";

import type { TelemetrySink } from "#application/ports/telemetry-sink";
import { createScrubTransform } from "#application/turn/stream/scrub-filter";

import { recordTelemetrySafely } from "./record-telemetry-safely.js";

/** Connect scrub-filter defense-in-depth counters without exposing chunk values. */
export function createObservedScrubTransform(
  telemetry: Pick<TelemetrySink, "record">,
): TransformStream<UIMessageChunk, UIMessageChunk> {
  return createScrubTransform({
    onUnknownChunk: () =>
      recordTelemetrySafely(telemetry, {
        type: "stream.unknown_chunk",
        count: 1,
      }),
    onDroppedTerminalChunk: () =>
      recordTelemetrySafely(telemetry, {
        type: "stream.duplicate_terminal",
        count: 1,
      }),
  });
}
