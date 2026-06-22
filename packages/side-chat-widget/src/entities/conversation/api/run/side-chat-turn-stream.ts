import { omitUndefinedProperties } from "@side-chat/shared";

import { SideChatApiError } from "../http/side-chat-api-error.js";
import { assertNotAborted, buildPathUrl } from "../http/side-chat-http-helpers.js";
import { decodeChunkedSseStream, type StreamChunk } from "../sse/side-chat-sse-reader.js";
import type {
  FetchLike,
  SideChatApiClientOptions,
  SubscribeTurnOptions,
  SubscribeTurnResult,
} from "../client/side-chat-api-types.js";

const DEFAULT_TURNS_PATH = "/chat/turns";
/** Default replay offset: -1 returns the whole turn from `sidechat.started`. */
const DEFAULT_REPLAY_OFFSET = -1;
// The server returns a JSON not_found before any SSE frame when a turn's log
// cannot be replayed (pruned or gone). The widget surfaces that as replay_expired
// so callers fall back to conversation history.
const REPLAY_EXPIRED_STATUS = 404;

/**
 * Subscribe (and replay) one assistant turn as Server-Sent Events.
 *
 * `after` follows the one project convention: events with `sequence > after` are
 * returned, default -1 replays from the start. A non-OK response before the SSE
 * body means the stream could not be opened: a 404 maps to `replay_expired` (the
 * log is gone — fall back to history); other statuses map to `http_error`.
 */
export const subscribeTurnWithFetch = async (
  assistantTurnId: string,
  clientOptions: SideChatApiClientOptions,
  options: SubscribeTurnOptions,
  transport: FetchLike,
): Promise<SubscribeTurnResult> => {
  assertNotAborted(options.signal);
  const after = options.after ?? DEFAULT_REPLAY_OFFSET;

  const response = await transport(
    streamUrl(clientOptions, assistantTurnId, after),
    streamInit(options.signal),
  );
  return streamResultFromResponse(response, options.signal);
};

const streamResultFromResponse = (
  response: Response,
  signal: AbortSignal | undefined,
): SubscribeTurnResult => {
  if (!response.ok) throw streamOpenError(response.status);
  if (!response.body) {
    throw new SideChatApiError("network_error", "Turn stream response body is missing");
  }
  return {
    events: decodeChunkedSseStream(
      readResponseBody(response.body),
      signal ? { signal } : undefined,
    ),
  };
};

const streamOpenError = (status: number): SideChatApiError => {
  if (status === REPLAY_EXPIRED_STATUS) {
    return new SideChatApiError("replay_expired", "Turn stream can no longer be replayed", {
      status,
    });
  }
  return new SideChatApiError("http_error", `Turn stream request failed: ${status}`, { status });
};

const streamUrl = (
  options: SideChatApiClientOptions,
  assistantTurnId: string,
  after: number,
): URL => {
  const base = buildPathUrl(options.baseUrl, options.turnsPath ?? DEFAULT_TURNS_PATH);
  const url = new URL(`${encodeURIComponent(assistantTurnId)}/stream`, `${base}/`);
  url.searchParams.set("after", String(after));
  return url;
};

const streamInit = (signal: AbortSignal | undefined): RequestInit =>
  omitUndefinedProperties({ headers: { accept: "text/event-stream" }, signal });

const readResponseBody = async function* (
  body: ReadableStream<Uint8Array>,
): AsyncIterable<StreamChunk> {
  const reader = body.getReader();
  try {
    while (true) {
      const read = await reader.read();
      if (read.done) return;
      yield read.value;
    }
  } finally {
    reader.releaseLock();
  }
};
