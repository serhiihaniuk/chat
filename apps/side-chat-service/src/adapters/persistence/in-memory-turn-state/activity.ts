import { Effect, Queue, Stream } from "effect";

import type {
  TurnActivityNotification,
  TurnActivityNotificationSource,
} from "#application/ports/turn/activity/turn-activity-source";
import type { TurnRef } from "#domain/turn/turn";

export type InMemoryTurnActivity = Readonly<{
  publish: (turn: TurnRef, status: string) => void;
  source: TurnActivityNotificationSource;
}>;

/** Disposable identity-only activity bus mirroring the Postgres notify adapter. */
export function createInMemoryTurnActivity(): InMemoryTurnActivity {
  const queue = Effect.runSync(Queue.unbounded<TurnActivityNotification>());
  return {
    publish: (turn, status) => {
      Queue.offerUnsafe(queue, {
        workspaceId: turn.workspaceId,
        subjectId: turn.subjectId,
        conversationId: turn.conversationId,
        assistantTurnId: turn.turnId,
        status,
      });
    },
    source: { notifications: Stream.fromQueue(queue) },
  };
}
