import type { TextStreamPart, ToolSet } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { coalesceDeltaParts } from "./delta-coalescer.js";

// The coalescer only inspects `type`, `id`, and `text`; text/reasoning deltas
// and a non-delta part (`text-start`) exercise its buffering, ordering, and flushes.
const text = (value: string): TextStreamPart<ToolSet> => ({
  type: "text-delta",
  id: "block-1",
  text: value,
});
const reasoning = (value: string, id = "reason-1"): TextStreamPart<ToolSet> => ({
  type: "reasoning-delta",
  id,
  text: value,
});
const nonDelta = (): TextStreamPart<ToolSet> => ({ type: "text-start", id: "block-1" });

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

describe("coalesceDeltaParts", () => {
  // Fake timers keep window expiry deterministic. Most cases flush on a stream
  // boundary; the expiry case advances the clock explicitly.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("passes parts through unchanged when batching is disabled", async () => {
    const parts = [text("a"), nonDelta(), text("b")];
    expect(await collect(coalesceDeltaParts(streamOf(parts), 0))).toEqual(parts);
  });

  it("merges consecutive text deltas and flushes before a non-delta part", async () => {
    const out = await collect(
      coalesceDeltaParts(streamOf([text("Hel"), text("lo"), nonDelta()]), 250),
    );
    expect(out).toEqual([text("Hello"), nonDelta()]);
  });

  it("flushes buffered text at stream end", async () => {
    const out = await collect(coalesceDeltaParts(streamOf([text("a"), text("b"), text("c")]), 250));
    expect(out).toEqual([text("abc")]);
  });

  it("flushes the current delta when the window expires before the next part", async () => {
    let releaseNext!: () => void;
    const nextPartReady = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });
    const delayedParts = async function* (): AsyncIterable<TextStreamPart<ToolSet>> {
      yield text("a");
      await nextPartReady;
      yield text("b");
    };
    const iterator = coalesceDeltaParts(delayedParts(), 250)[Symbol.asyncIterator]();

    const firstRead = iterator.next();
    await vi.advanceTimersByTimeAsync(250);
    await expect(firstRead).resolves.toEqual({ done: false, value: text("a") });

    releaseNext();
    await expect(iterator.next()).resolves.toEqual({ done: false, value: text("b") });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("opens a fresh window after a non-delta part", async () => {
    const out = await collect(
      coalesceDeltaParts(streamOf([text("a"), nonDelta(), text("b"), text("c")]), 250),
    );
    expect(out).toEqual([text("a"), nonDelta(), text("bc")]);
  });

  it("merges consecutive reasoning deltas of one block", async () => {
    const out = await collect(
      coalesceDeltaParts(streamOf([reasoning("thin"), reasoning("king")]), 250),
    );
    expect(out).toEqual([reasoning("thinking")]);
  });

  it("never merges across a type switch or a reasoning block boundary", async () => {
    const out = await collect(
      coalesceDeltaParts(
        streamOf([reasoning("plan"), text("answer"), reasoning("a", "r1"), reasoning("b", "r2")]),
        250,
      ),
    );
    expect(out).toEqual([
      reasoning("plan"),
      text("answer"),
      reasoning("a", "r1"),
      reasoning("b", "r2"),
    ]);
  });

  it("starts a fresh window from a delta that closes the preceding window", async () => {
    const out = await collect(
      coalesceDeltaParts(
        streamOf([
          reasoning("plan"),
          text("answer"),
          text(" continues"),
          reasoning("first", "r1"),
          reasoning("second", "r2"),
          reasoning(" continues", "r2"),
        ]),
        250,
      ),
    );
    expect(out).toEqual([
      reasoning("plan"),
      text("answer continues"),
      reasoning("first", "r1"),
      reasoning("second continues", "r2"),
    ]);
  });

  it("preserves total text content across the merge", async () => {
    const chunks = ["The ", "quick ", "brown ", "fox"];
    const out = await collect(coalesceDeltaParts(streamOf(chunks.map(text)), 250));
    const merged = out
      .filter((part) => part.type === "text-delta")
      .map((part) => (part as { text: string }).text)
      .join("");
    expect(merged).toBe(chunks.join(""));
  });
});
