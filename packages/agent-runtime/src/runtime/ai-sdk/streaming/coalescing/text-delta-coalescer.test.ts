import type { TextStreamPart, ToolSet } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { coalesceTextDeltaParts } from "./text-delta-coalescer.js";

// The coalescer only inspects `type` and `text`; a `text-delta` and a non-text
// part (`text-start`) are enough to exercise its buffering, ordering, and flushes.
const text = (value: string): TextStreamPart<ToolSet> => ({
  type: "text-delta",
  id: "block-1",
  text: value,
});
const nonText = (): TextStreamPart<ToolSet> => ({ type: "text-start", id: "block-1" });

const streamOf = async function* (
  parts: readonly TextStreamPart<ToolSet>[],
): AsyncIterable<TextStreamPart<ToolSet>> {
  for (const part of parts) yield part;
};

const collect = async (parts: AsyncIterable<TextStreamPart<ToolSet>>) => {
  const out: TextStreamPart<ToolSet>[] = [];
  for await (const part of parts) out.push(part);
  return out;
};

describe("coalesceTextDeltaParts", () => {
  // Fake timers so the window timer never fires from elapsed wall-clock; every
  // flush below is driven by a boundary or stream end, which is deterministic.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("passes parts through unchanged when batching is disabled", async () => {
    const parts = [text("a"), nonText(), text("b")];
    expect(await collect(coalesceTextDeltaParts(streamOf(parts), 0))).toEqual(parts);
  });

  it("merges consecutive text deltas and flushes before a non-text part", async () => {
    const out = await collect(
      coalesceTextDeltaParts(streamOf([text("Hel"), text("lo"), nonText()]), 250),
    );
    expect(out).toEqual([text("Hello"), nonText()]);
  });

  it("flushes buffered text at stream end", async () => {
    const out = await collect(
      coalesceTextDeltaParts(streamOf([text("a"), text("b"), text("c")]), 250),
    );
    expect(out).toEqual([text("abc")]);
  });

  it("opens a fresh window after a non-text part", async () => {
    const out = await collect(
      coalesceTextDeltaParts(streamOf([text("a"), nonText(), text("b"), text("c")]), 250),
    );
    expect(out).toEqual([text("a"), nonText(), text("bc")]);
  });

  it("preserves total text content across the merge", async () => {
    const chunks = ["The ", "quick ", "brown ", "fox"];
    const out = await collect(coalesceTextDeltaParts(streamOf(chunks.map(text)), 250));
    const merged = out
      .filter((part) => part.type === "text-delta")
      .map((part) => (part as { text: string }).text)
      .join("");
    expect(merged).toBe(chunks.join(""));
  });
});
