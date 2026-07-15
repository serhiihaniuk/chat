type DecodeSseFrame<TEvent> = (frame: string) => Iterable<TEvent>;

/** Incrementally decode a long-lived SSE response without owning product event contracts. */
export async function* decodeSseEventStream<TEvent>(
  body: ReadableStream<Uint8Array>,
  assertActive: () => void,
  decodeFrame: DecodeSseFrame<TEvent>,
): AsyncIterable<TEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      assertActive();
      const read = await reader.read();
      if (read.done) return;
      buffer = normalizeNewlines(buffer + decoder.decode(read.value, { stream: true }));
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        yield* decodeCompleteFrame(frame, decodeFrame);
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function* decodeCompleteFrame<TEvent>(
  frame: string,
  decodeFrame: DecodeSseFrame<TEvent>,
): Iterable<TEvent> {
  if (frame.trim().length === 0) return;
  try {
    yield* decodeFrame(`${frame}\n\n`);
  } catch {
    // Activity is advisory: reconnecting will replace a skipped malformed hint with a snapshot.
  }
}

const normalizeNewlines = (value: string): string =>
  value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
