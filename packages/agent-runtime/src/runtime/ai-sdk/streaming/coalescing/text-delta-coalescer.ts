import type { TextStreamPart, ToolSet } from "ai";

/**
 * Default window for batching streamed text into one durable delta.
 *
 * One row + one NOTIFY is written per emitted `sidechat.delta`, so emitting a
 * delta per provider token writes per token. Buffering text for a short window
 * and emitting one merged delta keeps the live feel while cutting durable writes
 * by the batch factor. Overridable via `flushIntervalMs`; `0` disables batching.
 */
export const DEFAULT_OUTPUT_DELTA_FLUSH_MS = 250;

type TextDeltaPart = Extract<TextStreamPart<ToolSet>, { readonly type: "text-delta" }>;

type CoalesceReader = {
  /** The next part without advancing — so it can be raced against the window timer. */
  readonly peek: () => Promise<IteratorResult<TextStreamPart<ToolSet>>>;
  /** The next part, advancing the cursor. */
  readonly consume: () => Promise<IteratorResult<TextStreamPart<ToolSet>>>;
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
 * Batch consecutive `text-delta` parts into ~`flushIntervalMs` windows.
 *
 * Source is the raw AI SDK part stream; target is the same stream with runs of
 * text deltas merged into one (text concatenated), so the pipeline emits and
 * persists one `sidechat.delta` per window instead of one per provider token.
 * `flushIntervalMs <= 0` disables batching. Sequence numbers are assigned
 * downstream per emitted part, so fewer parts stay contiguous — the live, replay,
 * and resume contracts are unchanged, only the chunk size of streamed text grows.
 */
export const coalesceTextDeltaParts = async function* (
  parts: AsyncIterable<TextStreamPart<ToolSet>>,
  flushIntervalMs: number,
): AsyncIterable<TextStreamPart<ToolSet>> {
  if (!(flushIntervalMs > 0)) {
    yield* parts;
    return;
  }
  const reader = createCoalesceReader(parts);
  for (;;) {
    const read = await reader.consume();
    if (read.done) return;
    if (isTextDeltaPart(read.value)) yield* drainTextWindow(reader, read.value, flushIntervalMs);
    else yield read.value;
  }
};

/**
 * Accumulate text deltas starting at `first` until the window closes — the
 * interval elapses, a non-text part arrives, or the stream ends — then emit one
 * merged delta. A non-text part that closed the window is forwarded after the
 * merged delta so the caller resumes from the next unread part.
 */
const drainTextWindow = async function* (
  reader: CoalesceReader,
  first: TextDeltaPart,
  flushIntervalMs: number,
): AsyncIterable<TextStreamPart<ToolSet>> {
  let text = first.text;
  const elapsed = new Promise<"elapsed">((resolve) => {
    setTimeout(() => resolve("elapsed"), flushIntervalMs);
  });
  for (;;) {
    const outcome = await Promise.race([reader.peek().then(() => "read" as const), elapsed]);
    if (outcome === "elapsed") break;
    const read = await reader.consume();
    if (read.done) break;
    if (!isTextDeltaPart(read.value)) {
      yield mergedTextDelta(first, text);
      yield read.value;
      return;
    }
    text += read.value.text;
  }
  yield mergedTextDelta(first, text);
};

const mergedTextDelta = (part: TextDeltaPart, text: string): TextStreamPart<ToolSet> => ({
  ...part,
  text,
});

const isTextDeltaPart = (part: TextStreamPart<ToolSet>): part is TextDeltaPart =>
  part.type === "text-delta";
