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
 * Build one subscriber's snapshot-plus-tail stream of subject turn activity.
 *
 * This is the single transport the activity SSE route serves:
 *
 * 1. register with the dispatcher first, so a transition during the snapshot read
 *    is not missed;
 * 2. emit a snapshot of every currently-running turn as `running` events (the
 *    client's initial set of live conversations);
 * 3. tail live transitions from the dispatcher fan-out.
 *
 * There is no terminal and no replay: the stream stays open until the browser
 * disconnects, and a dropped signal self-corrects when the client reconnects and
 * re-reads the snapshot. The client dedupes by conversation, so a snapshot entry
 * that also arrives live is harmless. `Stream.unwrap` runs the builder in the
 * stream's own scope, so the route converts it straight to a `ReadableStream`.
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
