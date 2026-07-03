import {
  encodeSseEvent,
  encodeTurnActivitySseEvent,
  type SidechatStreamEvent,
  type TurnActivityEvent,
} from "@side-chat/chat-protocol";
import { Duration, Schedule, Stream } from "effect";

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

/**
 * SSE comment keepalive. A line starting with `:` is a comment the browser
 * ignores, so it never reaches the protocol decoder — it only keeps bytes
 * flowing so an idle stream survives a load balancer's idle timeout.
 */
const SSE_HEARTBEAT_FRAME = ": hb\n\n";

/**
 * Merge a periodic comment heartbeat into an already-encoded SSE text stream.
 *
 * The heartbeat is an infinite schedule; `haltStrategy: "left"` ties the merged
 * stream's lifetime to the events stream, so a turn stream still ends at its
 * terminal event and a browser disconnect still interrupts the whole scope
 * (stopping the heartbeat timer). The first tick lands one interval in, so an
 * active stream sends no redundant keepalive.
 */
const withHeartbeat = (
  encoded: Stream.Stream<string>,
  heartbeatIntervalMs: number,
): Stream.Stream<string> => {
  const heartbeat = Stream.fromSchedule(Schedule.spaced(Duration.millis(heartbeatIntervalMs))).pipe(
    Stream.map(() => SSE_HEARTBEAT_FRAME),
  );
  return Stream.merge(encoded, heartbeat, { haltStrategy: "left" });
};

const sseBody = (encoded: Stream.Stream<string>, heartbeatIntervalMs: number): ReadableStream =>
  withHeartbeat(encoded, heartbeatIntervalMs).pipe(Stream.encodeText, Stream.toReadableStream);

/**
 * Stream `sidechat.v1` events to the browser as Server-Sent Events.
 *
 * The body is built straight from the subscription `Stream` via
 * `Stream.toReadableStream`, so there is no hand-rolled controller loop. When the
 * browser disconnects, the `ReadableStream` is cancelled, which interrupts the
 * stream's scope and runs the subscription's release finalizer — unsubscribing
 * this local subscriber only. It never interrupts the server-owned generation
 * fiber, which lives in the runner's scope. A terminal event ends the stream
 * (`takeUntil(isTerminal)` upstream), so the response closes normally. Comment
 * heartbeats keep an idle stream alive without touching the sequence machinery.
 */
export const streamSseResponse = (
  events: Stream.Stream<SidechatStreamEvent>,
  requestId: string,
  heartbeatIntervalMs: number,
): Response => {
  const body = sseBody(events.pipe(Stream.map(encodeSseEvent)), heartbeatIntervalMs);
  return new Response(body, { headers: { ...SSE_HEADERS, "x-request-id": requestId } });
};

/**
 * Stream subject-scoped turn-activity events to the browser as Server-Sent Events.
 *
 * The activity stream pushes cross-conversation lifecycle (a turn started or
 * finished) so the sidebar can show a live dot on chats the user is not viewing.
 * Unlike the per-turn stream it has no terminal event — it stays open until the
 * browser disconnects, which cancels the `ReadableStream` and releases the
 * dispatcher subscription. Comment heartbeats keep this often-quiet stream alive.
 */
export const streamActivitySseResponse = (
  events: Stream.Stream<TurnActivityEvent>,
  requestId: string,
  heartbeatIntervalMs: number,
): Response => {
  const body = sseBody(events.pipe(Stream.map(encodeTurnActivitySseEvent)), heartbeatIntervalMs);
  return new Response(body, { headers: { ...SSE_HEADERS, "x-request-id": requestId } });
};
