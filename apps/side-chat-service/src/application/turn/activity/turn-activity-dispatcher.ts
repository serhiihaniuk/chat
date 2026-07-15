import { TURN_ACTIVITY_EVENT_TYPE, type TurnActivityEvent } from "@side-chat/chat-protocol";
import { Effect, Exit, Queue, Scope, Stream } from "effect";

import type {
  TurnActivityNotification,
  TurnActivityNotificationSource,
} from "#application/ports/turn/activity/turn-activity-source";

const SUBSCRIBER_QUEUE_CAPACITY = 256;

export type ActivitySubscription = Readonly<{
  events: Queue.Dequeue<TurnActivityEvent>;
  release: () => Promise<void>;
}>;

export type TurnActivityDispatcher = Readonly<{
  subscribe: (input: { workspaceId: string; subjectId: string }) => Promise<ActivitySubscription>;
  shutdown: () => Promise<void>;
}>;

type ActivityFanout = { readonly subscribers: Set<Queue.Queue<TurnActivityEvent>> };

/**
 * Fan lifecycle hints out by authenticated workspace and subject.
 *
 * A bounded queue makes this deliberately lossy: the active-turn snapshot repairs
 * missed hints on reconnect, while a stalled browser cannot retain unbounded RAM.
 */
export function createTurnActivityDispatcher(
  notificationSource: TurnActivityNotificationSource,
): TurnActivityDispatcher {
  const scope = Effect.runSync(Scope.make());
  const fanouts = new Map<string, ActivityFanout>();
  const drain = Stream.runForEach(notificationSource.notifications, (notification) =>
    Effect.sync(() => fanOut(fanouts, notification)),
  );
  Effect.runSync(Effect.forkIn(drain, scope));

  return {
    subscribe: (input) => Effect.runPromise(registerSubscriber(fanouts, input)),
    shutdown: () => Effect.runPromise(Scope.close(scope, Exit.succeed(undefined))),
  };
}

function fanOut(
  fanouts: Map<string, ActivityFanout>,
  notification: TurnActivityNotification,
): void {
  const fanout = fanouts.get(fanoutKey(notification.workspaceId, notification.subjectId));
  if (!fanout) return;
  const event: TurnActivityEvent = {
    type: TURN_ACTIVITY_EVENT_TYPE,
    conversationId: notification.conversationId,
    assistantTurnId: notification.assistantTurnId,
    status: notification.status,
  };
  for (const queue of fanout.subscribers) Queue.offerUnsafe(queue, event);
}

const registerSubscriber = (
  fanouts: Map<string, ActivityFanout>,
  input: { readonly workspaceId: string; readonly subjectId: string },
): Effect.Effect<ActivitySubscription> =>
  Effect.gen(function* () {
    const queue = yield* Queue.dropping<TurnActivityEvent>(SUBSCRIBER_QUEUE_CAPACITY);
    const key = fanoutKey(input.workspaceId, input.subjectId);
    const fanout = fanouts.get(key) ?? { subscribers: new Set() };
    fanouts.set(key, fanout);
    fanout.subscribers.add(queue);
    return {
      events: queue,
      release: () => Effect.runPromise(releaseSubscriber(fanouts, key, queue)),
    };
  });

const releaseSubscriber = (
  fanouts: Map<string, ActivityFanout>,
  key: string,
  queue: Queue.Queue<TurnActivityEvent>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const fanout = fanouts.get(key);
    fanout?.subscribers.delete(queue);
    if (fanout?.subscribers.size === 0) fanouts.delete(key);
    yield* Queue.shutdown(queue);
  });

const fanoutKey = (workspaceId: string, subjectId: string): string =>
  `${workspaceId}\u0000${subjectId}`;
