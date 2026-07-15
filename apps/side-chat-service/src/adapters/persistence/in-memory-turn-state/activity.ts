import type {
  TurnActivityNotification,
  TurnActivityNotificationSource,
} from "#application/ports/turn/activity/turn-activity-source";
import type { TurnRef } from "#domain/turn/turn";

const NOTIFICATION_BUFFER_CAPACITY = 256;

export type InMemoryTurnActivity = Readonly<{
  publish: (turn: TurnRef) => void;
  source: TurnActivityNotificationSource;
}>;

/** Disposable identity-only activity bus mirroring the Postgres notify adapter. */
export function createInMemoryTurnActivity(): InMemoryTurnActivity {
  const subscribers = new Set<ReadableStreamDefaultController<TurnActivityNotification>>();
  return {
    publish: (turn) => {
      const notification = {
        workspaceId: turn.workspaceId,
        subjectId: turn.subjectId,
        conversationId: turn.conversationId,
        assistantTurnId: turn.turnId,
      };
      for (const subscriber of subscribers) {
        if ((subscriber.desiredSize ?? 0) > 0) subscriber.enqueue(notification);
      }
    },
    source: {
      openNotifications: () => {
        let subscriber: ReadableStreamDefaultController<TurnActivityNotification> | undefined;
        return new ReadableStream<TurnActivityNotification>(
          {
            start: (controller) => {
              subscriber = controller;
              subscribers.add(controller);
            },
            cancel: () => {
              if (subscriber) subscribers.delete(subscriber);
            },
          },
          { highWaterMark: NOTIFICATION_BUFFER_CAPACITY },
        );
      },
    },
  };
}
