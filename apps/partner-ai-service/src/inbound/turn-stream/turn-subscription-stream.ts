import type { AuthContext, StreamChatPorts } from "@side-chat/partner-ai-core";
import { isTerminalEvent, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import { Cause, Duration, Effect, Ref, Schedule, type Scope, Stream } from "effect";

import { recordResumableObservation } from "./turn-observability.js";
import type { TurnEventDispatcher, TurnEventSubscription } from "./turn-event-dispatcher.js";

const NO_TURN_EVENTS: readonly SidechatStreamEvent[] = [];

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
 * Build the live stream for one subscriber.
 *
 * The stream has four steps:

 * 1. Register before replay so no live event is missed.
 * 2. Replay buffered events after the requested sequence.
 * 3. Read new events from the dispatcher and the safety poll. Emit only the
 *    next sequence number; if there is a gap, reread the missing suffix.
 * 4. Stop after the first terminal event.

 * The registry is the source of truth. The dispatcher and poll only tell us
 * when to read it. This keeps replay and live delivery ordered and prevents a
 * missed notification from creating a permanent gap.
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
 * removes this local subscriber from the fan-out; it never touches the generation fiber.
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
 * Read live events from the dispatcher and the safety poll.
 *
 * Both paths use one sequence gate. The dispatcher is fast; the poll repairs a
 * missed notification. The gate runs in one consumer, so duplicate delivery is
 * emitted once and a full queue cannot create a permanent gap.
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
 * makes a dropped in-memory fan-out offer or a full subscriber queue
 * self-healing while keeping each poll read small.
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
        }).pipe(Effect.as(NO_TURN_EVENTS)),
      ),
    );

/**
 * Emit only the next sequence and repair gaps from the registry.
 *
 * Drop sequences already sent. Emit the next one directly. If a higher sequence
 * arrives, reread the retained suffix and emit it in order. If the reread is
 * empty, keep the cursor unchanged so the safety poll tries the same gap again.
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
