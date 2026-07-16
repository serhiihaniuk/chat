import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";

import type { TelemetryRecord } from "#application/ports/telemetry-sink";

import { createObservedScrubTransform } from "./observed-scrub-transform.js";

describe("observed scrub transform", () => {
  it("counts unknown and duplicate-terminal chunks without recording their content", async () => {
    const sentinel = "PRIVATE_UNKNOWN_CHUNK_SENTINEL";
    const records: TelemetryRecord[] = [];
    const source = chunks(
      { type: "data-demo", data: { privateValue: sentinel } },
      { type: "finish" },
      { type: "abort" },
    );

    const output = await readAll(
      source.pipeThrough(
        createObservedScrubTransform({
          record: (record) => void records.push(record),
        }),
      ),
    );

    expect(output.map((chunk) => chunk.type)).toEqual(["data-demo", "finish"]);
    expect(records).toEqual([
      { type: "stream.unknown_chunk", count: 1 },
      { type: "stream.duplicate_terminal", count: 1 },
    ]);
    expect(JSON.stringify(records)).not.toContain(sentinel);
  });
});

function chunks(...values: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const value of values) controller.enqueue(value);
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const values: UIMessageChunk[] = [];
  for await (const value of stream) values.push(value);
  return values;
}
