import {
  decodeSseEvents,
  isTerminalEvent,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";

import { ChatClientError } from "#http/errors";

export type StreamChunk = string | Uint8Array;

export type ChunkedSseOptions = {
  readonly signal?: AbortSignal | undefined;
};

// Parse the response as sidechat protocol frames, not just text chunks. Every
// event must arrive in sequence, and the stream is valid only after a terminal
// event has been seen.
export const decodeChunkedSseStream = async function* (
  chunks: AsyncIterable<StreamChunk>,
  options: ChunkedSseOptions = {},
): AsyncIterable<SidechatStreamEvent> {
  const state = createStreamState();
  let buffer = "";
  const decoder = new TextDecoder();

  for await (const chunk of chunks) {
    assertNotAborted(options.signal);
    buffer = normalizeNewlines(buffer + decodeChunk(chunk, decoder));
    const extracted = extractFrames(buffer);
    buffer = extracted.remaining;

    for (const frame of extracted.frames) {
      yield* decodeFrame(frame, state);
    }
  }

  buffer = normalizeNewlines(buffer + decoder.decode());
  const extracted = extractFrames(buffer);

  for (const frame of extracted.frames) {
    yield* decodeFrame(frame, state);
  }

  assertNotAborted(options.signal);
  // A valid assistant stream ends cleanly after one terminal event. Leftover
  // bytes or no terminal event means the conversation is incomplete.
  if (extracted.remaining.trim().length > 0) {
    throw new ChatClientError("malformed_stream", "SSE stream ended with an incomplete frame");
  }
  if (!state.terminalSeen) {
    throw new ChatClientError("missing_terminal", "SSE stream ended before a terminal event");
  }
};

type StreamState = {
  // Tracks stream rules that span more than one SSE frame.
  previousSequence: number;
  terminalSeen: boolean;
};

type ExtractedFrames = {
  readonly frames: readonly string[];
  readonly remaining: string;
};

const createStreamState = (): StreamState => ({
  previousSequence: -1,
  terminalSeen: false,
});

const decodeChunk = (chunk: StreamChunk, decoder: TextDecoder): string => {
  if (typeof chunk === "string") return chunk;
  return decoder.decode(chunk, { stream: true });
};

const normalizeNewlines = (value: string): string =>
  value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");

const extractFrames = (source: string): ExtractedFrames => {
  const frames: string[] = [];
  let remaining = source;
  let boundary = remaining.indexOf("\n\n");

  while (boundary >= 0) {
    const frame = remaining.slice(0, boundary);
    if (frame.trim().length > 0) frames.push(frame);
    remaining = remaining.slice(boundary + 2);
    boundary = remaining.indexOf("\n\n");
  }

  return { frames, remaining };
};

const decodeFrame = function* (frame: string, state: StreamState): Iterable<SidechatStreamEvent> {
  try {
    const events = decodeSseEvents(`${frame}\n\n`);
    for (const event of events) {
      validateIncrementalEvent(event, state);
      yield event;
    }
  } catch (cause) {
    if (cause instanceof ChatClientError) throw cause;
    throw new ChatClientError("malformed_stream", "Invalid SSE frame", {
      cause,
    });
  }
};

const validateIncrementalEvent = (event: SidechatStreamEvent, state: StreamState): void => {
  // Sequence order and a single terminal event are part of sidechat.v1. The
  // client rejects streams that would make later UI state ambiguous.
  if (event.sequence <= state.previousSequence) {
    throw new ChatClientError("malformed_stream", "SSE event sequence must increase");
  }
  if (state.terminalSeen) {
    throw new ChatClientError("malformed_stream", "SSE event received after terminal event");
  }

  state.previousSequence = event.sequence;
  if (isTerminalEvent(event)) state.terminalSeen = true;
};

const assertNotAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw new ChatClientError("aborted", "Chat stream was aborted", {
      cause: signal.reason,
    });
  }
};
