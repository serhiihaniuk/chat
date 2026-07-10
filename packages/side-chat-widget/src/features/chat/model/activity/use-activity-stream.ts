import { useEffect, useRef, useState } from "react";

import type { TurnActivityEvent } from "@side-chat/chat-protocol";
import type { SideChatApiClient } from "#entities/conversation";

/** Reconnect backoff: full-jittered exponential from 500 ms, capped at 30 s. */
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 30_000;

type SubscribeActivity = NonNullable<SideChatApiClient["subscribeActivity"]>;
type SetRunningIds = (updater: (current: ReadonlySet<string>) => ReadonlySet<string>) => void;

type ActivityStreamInput = {
  readonly client: Pick<SideChatApiClient, "subscribeActivity">;
  /** Called on each successful (re)connect — refetch the list to close any gap. */
  readonly onConnected?: (() => void) | undefined;
  /**
   * Called for every snapshot/live activity event, after the running-set update.
   * Lets a tab viewing the affected conversation resume a turn that started in
   * another tab — the dot alone never pulls in the turn's content.
   */
  readonly onEvent?: ((event: TurnActivityEvent) => void) | undefined;
};

/**
 * Track which conversations have a running turn.
 *
 * The server sends a snapshot when the connection opens, then sends changes.
 * A running event adds an id; any terminal event removes it. The returned set
 * drives the sidebar's "generating" dots.
 *
 * The connection starts on mount, reconnects after failures or `online`, and
 * stops on unmount. Returning to a visible tab only refetches the list; it does
 * not interrupt a healthy stream. `onEvent` forwards events to the viewing tab
 * so it can refresh a turn started in another tab.
 */
export const useActivityStream = (input: ActivityStreamInput): ReadonlySet<string> => {
  const [runningIds, setRunningIds] = useState<ReadonlySet<string>>(emptySet);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    if (!inputRef.current.client.subscribeActivity) return;

    const loop = startActivityLoop(
      () => inputRef.current.client.subscribeActivity,
      setRunningIds,
      () => inputRef.current.onConnected?.(),
      (event) => inputRef.current.onEvent?.(event),
    );
    // Refocus refetches the list to close any gap, but must not abort a healthy
    // stream — the SSE keeps delivering (buffered events flush on resume).
    const onVisible = (): void => {
      if (document.visibilityState === "visible") inputRef.current.onConnected?.();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", loop.reconnect);
    return () => {
      loop.stop();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", loop.reconnect);
    };
  }, []);

  return runningIds;
};

type ActivityLoop = { readonly stop: () => void; readonly reconnect: () => void };

/**
 * Keep the activity connection open and reconnect it when needed.
 *
 * Each new connection starts with a fresh snapshot, which clears turns that
 * ended while the client was disconnected. A successful connection resets the
 * backoff; repeated failures increase it up to the cap. `reconnect` aborts the
 * current attempt, while `stop` ends the loop during unmount.
 */
const startActivityLoop = (
  getSubscribe: () => SubscribeActivity | undefined,
  setRunningIds: SetRunningIds,
  onConnected: () => void,
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
    setRunningIds(clearRunning);
    onConnected();
    for await (const event of events) {
      if (!active) return;
      setRunningIds((current) => applyActivity(current, event));
      onEvent(event);
    }
  };

  const loop = async (): Promise<void> => {
    let attempt = 0;
    while (active) {
      try {
        // Reset the backoff only once a connection is actually established, so a
        // reachable server retries fast while a down one keeps escalating.
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

// Full-jitter exponential backoff: a random point in [0, min(cap, base·2^attempt)]
// so many widgets reconnecting after an outage do not resynchronize into a herd.
const backoffDelayMs = (attempt: number): number => {
  const ceiling = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
  return Math.random() * ceiling;
};

const emptySet = (): ReadonlySet<string> => new Set<string>();

const clearRunning = (current: ReadonlySet<string>): ReadonlySet<string> =>
  current.size === 0 ? current : new Set<string>();

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
