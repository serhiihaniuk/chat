import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";

import { createScrubTransform, type ScrubObserver } from "./scrub-filter.js";

describe("outbound scrub filter", () => {
  it("replaces raw provider error text with a safe code", async () => {
    const sentinel = "RAW provider secret sk-live-should-never-ship";
    const out = await scrub([{ type: "error", errorText: sentinel }]);
    expect(out).toEqual([{ type: "error", errorText: "provider_failed" }]);
    expect(JSON.stringify(out)).not.toContain(sentinel);
  });

  it("forwards a native content-filter finish reason untouched", async () => {
    const out = await scrub([{ type: "finish", finishReason: "content-filter" }]);
    expect(out).toEqual([{ type: "finish", finishReason: "content-filter" }]);
  });

  it("forwards unknown chunk types and counts them", async () => {
    const unknown: UIMessageChunk = { type: "data-demo", data: { phase: "streaming" } };
    const seen: string[] = [];
    const out = await scrub([{ type: "start" }, unknown, { type: "finish" }], {
      onUnknownChunk: (type) => seen.push(type),
    });
    expect(out.map((part) => part.type)).toEqual(["start", "data-demo", "finish"]);
    expect(seen).toEqual(["data-demo"]);
  });

  it("drops a second terminal chunk and counts it", async () => {
    const dropped: string[] = [];
    const out = await scrub(
      [
        { type: "start" },
        { type: "finish", finishReason: "stop" },
        { type: "finish", finishReason: "stop" },
      ],
      { onDroppedTerminalChunk: (type) => dropped.push(type) },
    );
    expect(out.filter((part) => part.type === "finish")).toHaveLength(1);
    expect(dropped).toEqual(["finish"]);
  });

  it("treats error and abort as terminal for the single-terminal guard", async () => {
    const dropped: string[] = [];
    const out = await scrub([{ type: "abort" }, { type: "error", errorText: "boom" }], {
      onDroppedTerminalChunk: (type) => dropped.push(type),
    });
    expect(out.map((part) => part.type)).toEqual(["abort"]);
    expect(dropped).toEqual(["error"]);
  });
});

async function scrub(input: UIMessageChunk[], observer?: ScrubObserver): Promise<UIMessageChunk[]> {
  const source = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of input) controller.enqueue(chunk);
      controller.close();
    },
  });
  const output: UIMessageChunk[] = [];
  const reader = source.pipeThrough(createScrubTransform(observer)).getReader();
  while (true) {
    const next = await reader.read();
    if (next.done) return output;
    output.push(next.value);
  }
}
