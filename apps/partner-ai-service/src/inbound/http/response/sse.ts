import { encodeSseEvent, type SidechatStreamEvent } from "@side-chat/chat-protocol";
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
