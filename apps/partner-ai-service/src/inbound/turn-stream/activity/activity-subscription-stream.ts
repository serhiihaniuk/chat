import type { SidechatRepositories } from "@side-chat/db";
import { TURN_ACTIVITY_EVENT_TYPE, type TurnActivityEvent } from "@side-chat/chat-protocol";
import { Effect, type Scope, Stream } from "effect";

import type { ActivitySubscription, TurnActivityDispatcher } from "./turn-activity-dispatcher.js";

const NO_TURN_ACTIVITY_EVENTS: readonly TurnActivityEvent[] = [];

export type ActivityStreamInput = {
  readonly workspaceId: string;
  readonly subjectId: string;
};

export type ActivityStreamDependencies = {
  readonly dispatcher: TurnActivityDispatcher;
  readonly repositories: Pick<SidechatRepositories, "listActiveAssistantTurns">;
};

/**
 * Build one subscriber's activity stream.
 *
 * Register with the dispatcher first, then send a snapshot of every running
 * turn, and finally keep sending live changes. Registering first prevents a
 * change during the snapshot read from being lost.
 *
 * This stream has no terminal event or replay. It stays open until the browser
 * disconnects. A reconnect gets a new snapshot, which repairs a missed signal.
 * Duplicate snapshot/live entries are safe because the client dedupes them.
 */
export const createActivitySubscriptionStream = (
  dependencies: ActivityStreamDependencies,
  input: ActivityStreamInput,
): Stream.Stream<TurnActivityEvent> => Stream.unwrap(openActivityStream(dependencies, input));

const openActivityStream = (
  dependencies: ActivityStreamDependencies,
  input: ActivityStreamInput,
): Effect.Effect<Stream.Stream<TurnActivityEvent>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const subscription = yield* acquireSubscription(dependencies.dispatcher, input);
    const snapshot = yield* readSnapshot(dependencies.repositories, input);
    return Stream.concat(Stream.fromIterable(snapshot), Stream.fromQueue(subscription.events));
  });

/**
 * Register with the dispatcher as a scoped resource.
 *
 * Registering is the acquire and `release` is the finalizer, so the local
 * subscriber is removed whenever the stream ends — including when the HTTP
 * response cancels on browser disconnect.
 */
const acquireSubscription = (
  dispatcher: TurnActivityDispatcher,
  input: ActivityStreamInput,
): Effect.Effect<ActivitySubscription, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.promise(() => dispatcher.subscribe(input)),
    (subscription) => Effect.promise(() => subscription.release()),
  );

/**
 * Read the currently-running turns for the subject as `running` activity events.
 *
 * A read failure yields an empty snapshot (not a fault): the live tail still
 * works, and the next reconnect re-reads the snapshot.
 */
const readSnapshot = (
  repositories: Pick<SidechatRepositories, "listActiveAssistantTurns">,
  input: ActivityStreamInput,
): Effect.Effect<readonly TurnActivityEvent[]> =>
  Effect.promise(() => repositories.listActiveAssistantTurns(input)).pipe(
    Effect.map((turns) =>
      turns.map(
        (turn): TurnActivityEvent => ({
          type: TURN_ACTIVITY_EVENT_TYPE,
          conversationId: turn.conversationId,
          assistantTurnId: turn.assistantTurnId,
          status: turn.status,
        }),
      ),
    ),
    Effect.catchCause(() => Effect.succeed(NO_TURN_ACTIVITY_EVENTS)),
  );
