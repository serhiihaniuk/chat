import { omitUndefinedProperties } from "@side-chat/shared";
import { decodeTurnActivitySseEvents, type TurnActivityEvent } from "@side-chat/chat-protocol";

import { SideChatApiError } from "../http/side-chat-api-error.js";
import { assertNotAborted, buildPathUrl } from "../http/side-chat-http-helpers.js";
import type {
  FetchLike,
  SideChatApiClientOptions,
  SubscribeActivityOptions,
  SubscribeActivityResult,
} from "../client/side-chat-api-types.js";

const DEFAULT_ACTIVITY_PATH = "/chat/activity";

/**
 * Subscribe to the subject-scoped activity stream as Server-Sent Events.
 *
 * Yields a snapshot of currently-running turns, then live lifecycle transitions.
 * Unlike the per-turn stream it has no terminal and no sequence rules — it yields
 * until the caller aborts. A malformed frame is skipped so one bad signal never
 * ends the stream.
 */
export const subscribeActivityWithFetch = async (
  clientOptions: SideChatApiClientOptions,
  options: SubscribeActivityOptions,
  transport: FetchLike,
): Promise<SubscribeActivityResult> => {
  assertNotAborted(options.signal);
  const response = await transport(activityUrl(clientOptions), activityInit(options.signal));
  if (!response.ok) {
    throw new SideChatApiError("http_error", `Activity stream request failed: ${response.status}`, {
      status: response.status,
    });
  }
  if (!response.body) {
    throw new SideChatApiError("network_error", "Activity stream response body is missing");
  }
  return { events: decodeActivityFrames(response.body, options.signal) };
};

const activityUrl = (options: SideChatApiClientOptions): string =>
  buildPathUrl(options.baseUrl, options.activityPath ?? DEFAULT_ACTIVITY_PATH);

const activityInit = (signal: AbortSignal | undefined): RequestInit =>
  omitUndefinedProperties({ headers: { accept: "text/event-stream" }, signal });

const decodeActivityFrames = async function* (
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
): AsyncIterable<TurnActivityEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      assertNotAborted(signal);
      const read = await reader.read();
      if (read.done) return;
      buffer = normalizeNewlines(buffer + decoder.decode(read.value, { stream: true }));
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        yield* decodeActivityFrame(frame);
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
};

const decodeActivityFrame = function* (frame: string): Iterable<TurnActivityEvent> {
  if (frame.trim().length === 0) return;
  try {
    yield* decodeTurnActivitySseEvents(`${frame}\n\n`);
  } catch {
    // Skip a malformed frame; the next reconnect re-reads the snapshot anyway.
  }
};

const normalizeNewlines = (value: string): string =>
  value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
