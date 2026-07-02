import type { AuthContext, StreamChatPorts } from "@side-chat/partner-ai-core";
import { isTerminalEvent, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import { Cause, Duration, Effect, Ref, Schedule, type Scope, Stream } from "effect";

import { recordResumableObservation } from "./turn-observability.js";
import type { TurnEventDispatcher, TurnEventSubscription } from "./turn-event-dispatcher.js";

export type TurnSubscriptionInput = {
  readonly assistantTurnId: string;
  readonly authContext: AuthContext;
  /** Replay offset: emit events with `sequence > after`; `-1` replays the whole turn. */
  readonly after: number;
  /**
   * Serve the buffered replay and end — never tail.
   *
   * Set for turns already terminal in the database: everything they will ever
   * emit is in the buffer, so tailing could only hang (e.g. `after` at or past
   * the terminal sequence leaves nothing for `takeUntil` to fire on).
   */
  readonly replayOnly?: boolean;
};

/** The slice of the stream-chat ports the subscription transport actually reads. */
export type TurnStreamPorts = Pick<StreamChatPorts, "turnEventLog" | "clock" | "observability">;

export type TurnSubscriptionDependencies = {
  readonly dispatcher: TurnEventDispatcher;
  readonly ports: TurnStreamPorts;
  readonly safetyPollIntervalMs: number;
};

/**
 * Build one subscriber's replay-plus-tail stream over the in-memory registry.
 *
 * This is the single live transport the SSE route serves. It follows the
 * resumability contract exactly:
 *
 * 1. register with the dispatcher first, so no fan-out is missed during replay;
 * 2. replay `readEventsAfter(after)` from the registry buffer, tracking the high
 *    sequence already emitted;
 * 3. tail live events — dispatcher fan-out plus a low-frequency safety poll —
 *    through a DENSE gate: only `maxEmitted + 1` is emitted directly, a gap
 *    triggers a re-read of the log suffix, so replay and tail never duplicate
 *    and a dropped fan-out offer never becomes a permanent hole;
 * 4. end at the first terminal event (`takeUntil(isTerminal)`).
 *
 * A turn that is already terminal in the log replays its terminal and ends at
 * step 4 without ever needing the tail. The registry buffer is the source of truth;
 * the dispatcher and poll only decide *when* to read. `Stream.unwrap` runs the
 * builder in the stream's own scope, so the result has no service requirements
 * and the route converts it straight to a `ReadableStream`.
 */
export const createTurnSubscriptionStream = (
  dependencies: TurnSubscriptionDependencies,
  input: TurnSubscriptionInput,
): Stream.Stream<SidechatStreamEvent> => Stream.unwrap(openSubscriptionStream(dependencies, input));

/**
 * Acquire the subscription and assemble its replay-then-tail stream.
 *
 * The subscription is acquired with `Effect.acquireRelease`, so the dispatcher
 * registration is released exactly when the stream's scope closes — on the
 * terminal event, on an error, or when the HTTP response cancels. Releasing only
 * unsubscribes this local subscriber; it never touches the generation fiber.
 */
const openSubscriptionStream = (
  dependencies: TurnSubscriptionDependencies,
  input: TurnSubscriptionInput,
): Effect.Effect<Stream.Stream<SidechatStreamEvent>, never, Scope.Scope> =>
  Effect.gen(function* () {
    // A subscription miss (the turn was swept between the route's ownership check
    // and this acquire) degrades to replay-only: serve whatever the log still
    // holds and end, instead of tailing a turn that will never emit again.
    const subscription = input.replayOnly
      ? undefined
      : yield* acquireSubscription(dependencies.dispatcher, input);
    const maxEmitted = yield* Ref.make(input.after);

    const replayStream = yield* gatedReplayStream(dependencies.ports, input, maxEmitted);
    const liveStream = subscription
      ? tailLiveEvents(dependencies, input, subscription, maxEmitted)
      : Stream.empty;

    return Stream.concat(replayStream, liveStream).pipe(Stream.takeUntil(isTerminalEvent));
  });

/**
 * Register with the dispatcher as a scoped resource.
 *
 * Registering is the acquire and `release` is the finalizer, so the local
 * subscriber is always removed when the stream ends however it ends.
 */
const acquireSubscription = (
  dispatcher: TurnEventDispatcher,
  input: TurnSubscriptionInput,
): Effect.Effect<TurnEventSubscription | undefined, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.promise(() =>
      dispatcher.subscribe({
        assistantTurnId: input.assistantTurnId,
        authContext: input.authContext,
      }),
    ),
    (subscription) => (subscription ? Effect.promise(() => subscription.release()) : Effect.void),
  );

/**
 * Read the replay rows once and advance the high-water mark past them.
 *
 * Reading replay once lets the tail's `sequence > maxEmitted` gate dedupe any
 * overlap between the replayed rows and events the dispatcher fans out while the
 * subscriber is registering.
 */
const gatedReplayStream = (
  ports: TurnStreamPorts,
  input: TurnSubscriptionInput,
  maxEmitted: Ref.Ref<number>,
): Effect.Effect<Stream.Stream<SidechatStreamEvent>> =>
  Effect.gen(function* () {
    const replay = yield* readEventsAfter(ports, input, input.after);
    for (const event of replay) {
      yield* Ref.update(maxEmitted, (current) => Math.max(current, event.sequence));
    }
    return Stream.fromIterable(replay);
  });

/**
 * Tail live events from the dispatcher fan-out plus the safety poll.
 *
 * Both sources feed one DENSE gate, so the registry buffer stays the source of
 * truth: the fan-out makes delivery low-latency, and the poll is the
 * missed-notify backstop. The gate is applied by the single consuming fiber, so
 * an event arriving on both paths is emitted exactly once, and a dropped
 * fan-out offer (a slow consumer's full queue) is healed by a re-read instead
 * of becoming a permanent hole.
 */
const tailLiveEvents = (
  dependencies: TurnSubscriptionDependencies,
  input: TurnSubscriptionInput,
  subscription: TurnEventSubscription,
  maxEmitted: Ref.Ref<number>,
): Stream.Stream<SidechatStreamEvent> => {
  const fannedOut = Stream.fromQueue(subscription.events);
  const polled = safetyPollStream(dependencies, input, maxEmitted);
  return Stream.merge(fannedOut, polled).pipe(
    Stream.mapEffect((event) => emitDense(dependencies.ports, input, maxEmitted, event)),
    Stream.flatMap((events) => Stream.fromIterable(events)),
  );
};

/**
 * Periodically re-read the registry buffer as a missed-signal backstop.
 *
 * Each tick reads everything after the current high-water mark and flattens it
 * into the live stream, where the shared gate drops anything already emitted. This
 * makes a dropped `NOTIFY` or a fan-out queue overflow self-healing while keeping
 * each poll read small.
 */
const safetyPollStream = (
  dependencies: TurnSubscriptionDependencies,
  input: TurnSubscriptionInput,
  maxEmitted: Ref.Ref<number>,
): Stream.Stream<SidechatStreamEvent> =>
  Stream.fromSchedule(Schedule.spaced(Duration.millis(dependencies.safetyPollIntervalMs))).pipe(
    Stream.mapEffect(() => Ref.get(maxEmitted)),
    Stream.mapEffect((after) => readEventsAfter(dependencies.ports, input, after)),
    Stream.flatMap((events) => Stream.fromIterable(events)),
  );

const readEventsAfter = (
  ports: TurnStreamPorts,
  input: TurnSubscriptionInput,
  after: number,
): Effect.Effect<readonly SidechatStreamEvent[]> =>
  ports.turnEventLog
    .readEventsAfter({
      authContext: input.authContext,
      assistantTurnId: input.assistantTurnId,
      after,
    })
    .pipe(
      // An empty read keeps the stream alive (the poll retries), but the cause is
      // recorded so a real persistence failure is never a silent empty replay.
      Effect.catchCause((cause) =>
        recordResumableObservation({
          sink: ports.observability,
          lifecycleState: "event_read_failed",
          assistantTurnId: input.assistantTurnId,
          requestId: input.assistantTurnId,
          now: ports.clock.now(),
          errorCode: "persistence_failed",
          attributes: { cause: Cause.pretty(cause).slice(0, 500) },
        }).pipe(Effect.as([] as readonly SidechatStreamEvent[])),
      ),
    );

/**
 * Emit only the next DENSE sequence; heal a gap by re-reading the log.
 *
 * A max-based gate would let a dropped fan-out offer (slow consumer, full queue)
 * advance past the missing sequence forever. Instead: an already-emitted
 * sequence is dropped, the next dense sequence is emitted directly, and a
 * higher-than-dense sequence triggers a re-read of the durable suffix — the
 * buffer holds every event of a live turn — which is emitted in order. If the
 * re-read comes back empty the mark stays put, so the safety poll retries the
 * same gap instead of skipping it.
 */
const emitDense = (
  ports: TurnStreamPorts,
  input: TurnSubscriptionInput,
  maxEmitted: Ref.Ref<number>,
  event: SidechatStreamEvent,
): Effect.Effect<readonly SidechatStreamEvent[]> =>
  Effect.gen(function* () {
    const current = yield* Ref.get(maxEmitted);
    if (event.sequence <= current) return [];
    if (event.sequence === current + 1) {
      yield* Ref.set(maxEmitted, event.sequence);
      return [event];
    }
    const suffix = yield* readEventsAfter(ports, input, current);
    const last = suffix.at(-1);
    if (last) yield* Ref.set(maxEmitted, last.sequence);
    return suffix;
  });
