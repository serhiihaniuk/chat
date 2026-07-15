import { useEffect, useRef, useState } from "react";

import {
  TURN_ACTIVITY_SYNC_EVENT_TYPE,
  type TurnActivityEvent,
  type TurnActivitySyncEvent,
} from "@side-chat/chat-protocol";
import type { SideChatApiClient } from "#entities/conversation";

/** Reconnect backoff: full-jittered exponential from 500 ms, capped at 30 s. */
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 30_000;

type SubscribeActivity = NonNullable<SideChatApiClient["subscribeActivity"]>;

export type ActivityStreamState = Readonly<{
  runningConversationIds: ReadonlySet<string>;
  /** True only after the server's post-subscription snapshot has arrived. */
  synchronized: boolean;
}>;

type SetActivityState = (updater: (current: ActivityStreamState) => ActivityStreamState) => void;

type ActivityStreamInput = {
  readonly client: Pick<SideChatApiClient, "subscribeActivity">;
  /** Called after the explicit synchronization snapshot has been consumed. */
  readonly onSynchronized?: ((event: TurnActivitySyncEvent) => void) | undefined;
  /** Request a durable read when a hidden tab becomes visible. */
  readonly onVisibilityReconcile?: (() => void) | undefined;
  /** Called for each lifecycle transition after the running-set update. */
  readonly onEvent?: ((event: TurnActivityEvent) => void) | undefined;
};

/**
 * Track subject-scoped turn activity without treating HTTP connection as state.
 *
 * The server first registers this subscriber, then sends one synchronization
 * snapshot, including when that snapshot is empty. Only that frame establishes
 * the initial running set. Later transition frames patch it. Refocusing a tab
 * asks the caller for a durable reconciliation read but leaves a healthy SSE
 * connection intact.
 */
export const useActivityStream = (input: ActivityStreamInput): ActivityStreamState => {
  const [state, setState] = useState<ActivityStreamState>(initialActivityState);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    if (!inputRef.current.client.subscribeActivity) return;

    const loop = startActivityLoop(
      () => inputRef.current.client.subscribeActivity,
      setState,
      (event) => inputRef.current.onSynchronized?.(event),
      (event) => inputRef.current.onEvent?.(event),
    );
    const onVisible = (): void => {
      if (document.visibilityState === "visible") inputRef.current.onVisibilityReconcile?.();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", loop.reconnect);
    return () => {
      loop.stop();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", loop.reconnect);
    };
  }, []);

  return state;
};

type ActivityLoop = { readonly stop: () => void; readonly reconnect: () => void };

/** Keep the activity connection open and re-establish its snapshot after gaps. */
const startActivityLoop = (
  getSubscribe: () => SubscribeActivity | undefined,
  setState: SetActivityState,
  onSynchronized: (event: TurnActivitySyncEvent) => void,
  onEvent: (event: TurnActivityEvent) => void,
): ActivityLoop => {
  let active = true;
  let controller: AbortController | undefined;

  const consumeOnce = async (onConnect: () => void): Promise<void> => {
    const subscribe = getSubscribe();
    if (!subscribe) throw new Error("activity subscription unavailable");
    controller = new AbortController();
    const { events } = await subscribe({ signal: controller.signal });
    if (!active) return;
    onConnect();
    setState(markUnsynchronized);
    for await (const event of events) {
      if (!active) return;
      if (event.type === TURN_ACTIVITY_SYNC_EVENT_TYPE) {
        setState(() => synchronizedState(event));
        onSynchronized(event);
      } else {
        setState((current) => ({
          ...current,
          runningConversationIds: applyActivity(current.runningConversationIds, event),
        }));
        onEvent(event);
      }
    }
  };

  const loop = async (): Promise<void> => {
    let attempt = 0;
    while (active) {
      try {
        await consumeOnce(() => {
          attempt = 0;
        });
      } catch {
        if (!active) return;
      }
      if (active) {
        await delay(backoffDelayMs(attempt));
        attempt += 1;
      }
    }
  };
  void loop();

  return {
    stop: () => {
      active = false;
      controller?.abort();
    },
    reconnect: () => controller?.abort(),
  };
};

// Full-jitter exponential backoff prevents reconnecting widgets from herding.
const backoffDelayMs = (attempt: number): number => {
  const ceiling = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
  return Math.random() * ceiling;
};

const initialActivityState = (): ActivityStreamState => ({
  runningConversationIds: new Set<string>(),
  synchronized: false,
});

const markUnsynchronized = (current: ActivityStreamState): ActivityStreamState =>
  current.synchronized ? { ...current, synchronized: false } : current;

const synchronizedState = (event: TurnActivitySyncEvent): ActivityStreamState => ({
  runningConversationIds: new Set(event.activeTurns.map((turn) => turn.conversationId)),
  synchronized: true,
});

const applyActivity = (
  current: ReadonlySet<string>,
  event: TurnActivityEvent,
): ReadonlySet<string> => {
  const isRunning = event.status === "running";
  if (isRunning === current.has(event.conversationId)) return current;
  const next = new Set(current);
  if (isRunning) next.add(event.conversationId);
  else next.delete(event.conversationId);
  return next;
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
