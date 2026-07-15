import {
  TURN_ACTIVITY_SYNC_EVENT_TYPE,
  type TurnActivityStreamEvent,
  type TurnActivitySyncEvent,
} from "@side-chat/chat-protocol";
import { Effect, type Scope, Stream } from "effect";

import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { AuthContext } from "#domain/auth-context";
import type { ActivitySubscription, TurnActivityDispatcher } from "./turn-activity-dispatcher.js";

/** Register first, then snapshot, so a lifecycle change during the read is buffered. */
export function createActivitySubscriptionStream(
  dispatcher: TurnActivityDispatcher,
  queries: Pick<ConversationQueryStore, "listActiveTurns">,
  auth: AuthContext,
): Stream.Stream<TurnActivityStreamEvent> {
  return Stream.unwrap(
    Effect.gen(function* () {
      const subscription = yield* acquireSubscription(dispatcher, auth);
      const snapshot = yield* readSnapshot(queries, auth);
      return Stream.concat(Stream.succeed(snapshot), Stream.fromQueue(subscription.events));
    }),
  );
}

const acquireSubscription = (
  dispatcher: TurnActivityDispatcher,
  auth: AuthContext,
): Effect.Effect<ActivitySubscription, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.promise(() =>
      dispatcher.subscribe({ workspaceId: auth.workspaceId, subjectId: auth.subjectId }),
    ),
    (subscription) => Effect.promise(subscription.release),
  );

const readSnapshot = (
  queries: Pick<ConversationQueryStore, "listActiveTurns">,
  auth: AuthContext,
): Effect.Effect<TurnActivitySyncEvent> =>
  Effect.promise(() => queries.listActiveTurns(auth)).pipe(
    Effect.map((turns) => ({
      type: TURN_ACTIVITY_SYNC_EVENT_TYPE,
      activeTurns: turns.map((turn) => ({
        conversationId: turn.conversationId,
        assistantTurnId: turn.turnId,
      })),
    })),
    Effect.catchCause(() =>
      Effect.succeed({ type: TURN_ACTIVITY_SYNC_EVENT_TYPE, activeTurns: [] }),
    ),
  );
