import type { TextStreamPart, ToolSet } from "ai";

/**
 * Default window for batching streamed deltas before they enter core.
 *
 * Each emitted runtime delta becomes a browser event in the connection-bound
 * in-memory turn registry. A short batch window reduces protocol mapping, queue
 * wakeups, and widget updates without changing source order. `0` disables batching.
 */
export const DEFAULT_DELTA_FLUSH_MS = 250;

/**
 * The two part kinds whose runs are merged. Both carry the block `id` and the
 * chunk `text`; reasoning batching also caps how often the reasoning mapper
 * re-emits its (full-text-so-far) activity row.
 */
const COALESCIBLE_PART_TYPES = ["text-delta", "reasoning-delta"] as const;

type CoalesciblePartType = (typeof COALESCIBLE_PART_TYPES)[number];

type CoalesciblePart = Extract<TextStreamPart<ToolSet>, { readonly type: CoalesciblePartType }>;

type CoalesceReader = {
  /** The next part without advancing, so it can be raced against the window timer. */
  readonly peek: () => Promise<IteratorResult<TextStreamPart<ToolSet>>>;
  /** The next part, advancing the cursor. */
  readonly consume: () => Promise<IteratorResult<TextStreamPart<ToolSet>>>;
};

type DeltaWindow = {
  readonly merged: TextStreamPart<ToolSet>;
  readonly boundary?: TextStreamPart<ToolSet>;
};

const createCoalesceReader = (parts: AsyncIterable<TextStreamPart<ToolSet>>): CoalesceReader => {
  const iterator = parts[Symbol.asyncIterator]();
  let pending = iterator.next();
  return {
    peek: () => pending,
    consume: () => {
      const settled = pending;
      pending = iterator.next();
      return settled;
    },
  };
};

/**
 * Batch consecutive same-block text/reasoning deltas into ~`flushIntervalMs` windows.
 *
 * Source is the raw AI SDK part stream; target is the same stream with runs of
 * deltas merged into one (text concatenated), so core receives one part per
 * window instead of one part per provider token. A window only merges parts of
 * one type and one block id: block endings and type switches close it, so merged
 * output never spans two blocks. `flushIntervalMs <= 0` disables batching.
 * Sequence numbers are assigned downstream per emitted part, so the
 * connection-bound live stream and same-instance replay keep their order; only
 * the delta chunk size grows.
 */
export const coalesceDeltaParts = async function* (
  parts: AsyncIterable<TextStreamPart<ToolSet>>,
  flushIntervalMs: number,
): AsyncIterable<TextStreamPart<ToolSet>> {
  if (!(flushIntervalMs > 0)) {
    yield* parts;
    return;
  }
  const reader = createCoalesceReader(parts);
  let carriedPart: TextStreamPart<ToolSet> | undefined;
  for (;;) {
    let part: TextStreamPart<ToolSet>;
    if (carriedPart === undefined) {
      const read = await reader.consume();
      if (read.done) return;
      part = read.value;
    } else {
      part = carriedPart;
      carriedPart = undefined;
    }
    if (!isCoalesciblePart(part)) {
      yield part;
      continue;
    }
    const window = await drainDeltaWindow(reader, part, flushIntervalMs);
    yield window.merged;
    carriedPart = window.boundary;
  }
};

/**
 * Accumulate deltas starting at `first` until the window closes.
 *
 * A timeout, different part type or block, or stream end closes the window. A
 * consumed boundary returns to the outer loop, where a coalescible boundary can
 * start its own window instead of bypassing batching.
 */
const drainDeltaWindow = async (
  reader: CoalesceReader,
  first: CoalesciblePart,
  flushIntervalMs: number,
): Promise<DeltaWindow> => {
  let text = first.text;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const elapsed = new Promise<"elapsed">((resolve) => {
    timeout = setTimeout(() => resolve("elapsed"), flushIntervalMs);
  });
  try {
    for (;;) {
      const outcome = await Promise.race([reader.peek().then(() => "read" as const), elapsed]);
      if (outcome === "elapsed") return { merged: mergedDelta(first, text) };
      const read = await reader.consume();
      if (read.done) return { merged: mergedDelta(first, text) };
      if (!continuesWindow(first, read.value)) {
        return { merged: mergedDelta(first, text), boundary: read.value };
      }
      text += read.value.text;
    }
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

const mergedDelta = (part: CoalesciblePart, text: string): TextStreamPart<ToolSet> => ({
  ...part,
  text,
});

const isCoalesciblePart = (part: TextStreamPart<ToolSet>): part is CoalesciblePart =>
  part.type === "text-delta" || part.type === "reasoning-delta";

const continuesWindow = (
  first: CoalesciblePart,
  part: TextStreamPart<ToolSet>,
): part is CoalesciblePart =>
  isCoalesciblePart(part) && part.type === first.type && part.id === first.id;
