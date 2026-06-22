import {
  encodeSseEvent,
  encodeTurnActivitySseEvent,
  type SidechatStreamEvent,
  type TurnActivityEvent,
} from "@side-chat/chat-protocol";
import { Stream } from "effect";

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

/**
 * Stream `sidechat.v1` events to the browser as Server-Sent Events.
 *
 * The body is built straight from the subscription `Stream` via
 * `Stream.toReadableStream`, so there is no hand-rolled controller loop. When the
 * browser disconnects, the `ReadableStream` is cancelled, which interrupts the
 * stream's scope and runs the subscription's release finalizer — unsubscribing
 * this local subscriber only. It never interrupts the server-owned generation
 * fiber, which lives in the runner's scope. A terminal event ends the stream
 * (`takeUntil(isTerminal)` upstream), so the response closes normally.
 */
export const streamSseResponse = (
  events: Stream.Stream<SidechatStreamEvent>,
  requestId: string,
): Response => {
  const body = events.pipe(Stream.map(encodeSseEvent), Stream.encodeText, Stream.toReadableStream);
  return new Response(body, { headers: { ...SSE_HEADERS, "x-request-id": requestId } });
};

/**
 * Stream subject-scoped turn-activity events to the browser as Server-Sent Events.
 *
 * The activity stream pushes cross-conversation lifecycle (a turn started or
 * finished) so the sidebar can show a live dot on chats the user is not viewing.
 * Unlike the per-turn stream it has no terminal event — it stays open until the
 * browser disconnects, which cancels the `ReadableStream` and releases the
 * dispatcher subscription.
 */
export const streamActivitySseResponse = (
  events: Stream.Stream<TurnActivityEvent>,
  requestId: string,
): Response => {
  const body = events.pipe(
    Stream.map(encodeTurnActivitySseEvent),
    Stream.encodeText,
    Stream.toReadableStream,
  );
  return new Response(body, { headers: { ...SSE_HEADERS, "x-request-id": requestId } });
};
