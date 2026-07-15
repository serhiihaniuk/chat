import type {
  TurnActivityNotification,
  TurnActivityNotificationSource,
} from "#application/ports/turn/activity/turn-activity-source";

const SUBSCRIBER_QUEUE_CAPACITY = 256;

export type ActivitySubscription = Readonly<{
  events: ReadableStream<TurnActivityNotification>;
  release: () => Promise<void>;
}>;

export type TurnActivityDispatcher = Readonly<{
  subscribe: (input: { workspaceId: string; subjectId: string }) => Promise<ActivitySubscription>;
  shutdown: () => Promise<void>;
}>;

type ActivitySubscriber = Readonly<{
  controller: ReadableStreamDefaultController<TurnActivityNotification>;
  release: () => void;
}>;

type ActivityFanout = { readonly subscribers: Set<ActivitySubscriber> };

/**
 * Fan identity-only lifecycle invalidations out by authenticated workspace and subject.
 *
 * The bounded native streams are deliberately lossy: each HTTP subscription
 * re-reads Workflow-backed activity before exposing a public status, and its
 * initial synchronization snapshot repairs any invalidation dropped here.
 */
export function createTurnActivityDispatcher(
  notificationSource: TurnActivityNotificationSource,
): TurnActivityDispatcher {
  const fanouts = new Map<string, ActivityFanout>();
  const sourceReader = notificationSource.openNotifications().getReader();
  let stopped = false;
  const drain = drainNotifications(sourceReader, fanouts, () => stopped);

  return {
    subscribe: (input) => Promise.resolve(registerSubscriber(fanouts, input)),
    shutdown: async () => {
      if (stopped) return;
      stopped = true;
      await sourceReader.cancel();
      await drain;
      closeSubscribers(fanouts);
    },
  };
}

async function drainNotifications(
  reader: ReadableStreamDefaultReader<TurnActivityNotification>,
  fanouts: Map<string, ActivityFanout>,
  isStopped: () => boolean,
): Promise<void> {
  try {
    while (!isStopped()) {
      const next = await reader.read();
      if (next.done) return;
      fanOut(fanouts, next.value);
    }
  } catch {
    // The Postgres adapter reconnects internally. A terminal source failure
    // simply leaves snapshot/reconnect reconciliation as the correctness path.
  }
}

function fanOut(
  fanouts: Map<string, ActivityFanout>,
  notification: TurnActivityNotification,
): void {
  const fanout = fanouts.get(fanoutKey(notification.workspaceId, notification.subjectId));
  if (!fanout) return;
  for (const subscriber of fanout.subscribers) {
    if ((subscriber.controller.desiredSize ?? 0) > 0) {
      subscriber.controller.enqueue(notification);
    }
  }
}

function registerSubscriber(
  fanouts: Map<string, ActivityFanout>,
  input: { readonly workspaceId: string; readonly subjectId: string },
): ActivitySubscription {
  const key = fanoutKey(input.workspaceId, input.subjectId);
  const fanout = fanouts.get(key) ?? { subscribers: new Set<ActivitySubscriber>() };
  fanouts.set(key, fanout);

  let releaseSubscriber = (): void => undefined;
  const events = new ReadableStream<TurnActivityNotification>(
    {
      start: (controller) => {
        let active = true;
        const subscriber: ActivitySubscriber = {
          controller,
          release: () => {
            if (!active) return;
            active = false;
            removeSubscriber(fanouts, key, subscriber);
          },
        };
        releaseSubscriber = subscriber.release;
        fanout.subscribers.add(subscriber);
      },
      cancel: () => releaseSubscriber(),
    },
    { highWaterMark: SUBSCRIBER_QUEUE_CAPACITY },
  );

  return {
    events,
    release: () => {
      releaseSubscriber();
      return Promise.resolve();
    },
  };
}

function removeSubscriber(
  fanouts: Map<string, ActivityFanout>,
  key: string,
  subscriber: ActivitySubscriber,
): void {
  const fanout = fanouts.get(key);
  fanout?.subscribers.delete(subscriber);
  if (fanout?.subscribers.size === 0) fanouts.delete(key);
}

function closeSubscribers(fanouts: Map<string, ActivityFanout>): void {
  for (const fanout of fanouts.values()) {
    for (const subscriber of fanout.subscribers) {
      subscriber.controller.close();
      subscriber.release();
    }
  }
  fanouts.clear();
}

const fanoutKey = (workspaceId: string, subjectId: string): string =>
  `${workspaceId}\u0000${subjectId}`;
