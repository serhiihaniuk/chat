import { useEffect, useRef, useState } from "react";

import type { TurnActivityEvent } from "@side-chat/chat-protocol";
import type { SideChatApiClient } from "#entities/conversation";

/** Brief backoff before re-opening the activity stream after it ends or errors. */
const RECONNECT_DELAY_MS = 1_000;

type SubscribeActivity = NonNullable<SideChatApiClient["subscribeActivity"]>;
type SetRunningIds = (updater: (current: ReadonlySet<string>) => ReadonlySet<string>) => void;

type ActivityStreamInput = {
  readonly client: Pick<SideChatApiClient, "subscribeActivity">;
  /** Called on each successful (re)connect — refetch the list to close any gap. */
  readonly onConnected?: (() => void) | undefined;
};

/**
 * Subscribe to the subject-scoped activity stream and track which conversations
 * have a live turn, so the sidebar can show a "generating" dot — even on chats the
 * user is not viewing.
 *
 * The stream pushes a snapshot of running turns on connect, then live transitions.
 * The returned set is the source for the dots: a `running` event adds a
 * conversation, any terminal status removes it. The subscription is long-lived: it
 * opens on mount, reconnects on drop/error and on tab refocus/online (each
 * reconnect resets the set and re-reads the snapshot, so a turn that finished while
 * disconnected is not left stuck on), and tears down on unmount. A host whose
 * client lacks `subscribeActivity` simply gets an empty set (no dots).
 */
export const useActivityStream = (input: ActivityStreamInput): ReadonlySet<string> => {
  const [runningIds, setRunningIds] = useState<ReadonlySet<string>>(emptySet);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    const subscribe = inputRef.current.client.subscribeActivity;
    if (!subscribe) return;

    const loop = startActivityLoop(subscribe, setRunningIds, () =>
      inputRef.current.onConnected?.(),
    );
    const onVisible = (): void => {
      if (document.visibilityState === "visible") loop.reconnect();
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
 * Drive a reconnecting activity subscription until stopped.
 *
 * Each connection resets the set (a fresh snapshot is authoritative, so a turn that
 * ended while disconnected clears), refetches the list, then applies live events.
 * `reconnect` aborts the current connection so the loop re-opens it; `stop` ends
 * the loop on unmount.
 */
const startActivityLoop = (
  subscribe: SubscribeActivity,
  setRunningIds: SetRunningIds,
  onConnected: () => void,
): ActivityLoop => {
  let active = true;
  let controller: AbortController | undefined;

  const consumeOnce = async (): Promise<void> => {
    controller = new AbortController();
    const { events } = await subscribe({ signal: controller.signal });
    if (!active) return;
    setRunningIds(clearRunning);
    onConnected();
    for await (const event of events) {
      if (!active) return;
      setRunningIds((current) => applyActivity(current, event));
    }
  };

  const loop = async (): Promise<void> => {
    while (active) {
      try {
        await consumeOnce();
      } catch {
        if (!active) return;
      }
      if (active) await delay(RECONNECT_DELAY_MS);
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
