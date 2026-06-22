import { useCallback, useRef, useSyncExternalStore } from "react";

import {
  getWidgetRunStore,
  type WidgetRunStore,
  type WidgetRunStoreKey,
} from "../run/widget-run-store.js";
import type { WidgetRunState } from "../run/widget-run-state.js";
import {
  abortSubscription,
  beginRun,
  cancelRun,
  driveSubscription,
  openSubscription,
  releaseSubscription,
  type ActiveSubscription,
  type HostBridgeRef,
  type RunLifecycleContext,
  type StartRunInput,
  type SubscribeTarget,
} from "../subscription/widget-subscription-lifecycle.js";
import { resumeRunFromMarker, resumeTarget } from "../subscription/widget-run-resume.js";
import { clearActiveRunMarker } from "./widget-run-marker.js";
import type { SideChatApiClient } from "#entities/conversation";

export type { StartRunInput } from "../subscription/widget-subscription-lifecycle.js";

export type WidgetRunController = {
  /** Current live run, or undefined when idle. Read via `useSyncExternalStore`. */
  readonly run: WidgetRunState | undefined;
  /** Start a fresh run: create on the server, persist a marker, then subscribe. */
  readonly startRun: (input: StartRunInput) => Promise<void>;
  /** Resume the active run (mount / visibility / online / conversation select). */
  readonly reconnect: () => void;
  /** Cancel the live turn on the server, then render its terminal state. */
  readonly cancel: () => Promise<void>;
  /** Forget the live run locally (e.g. when switching conversations). */
  readonly clearRun: () => void;
};

export type WidgetRunControllerInput = {
  readonly client: SideChatApiClient;
  readonly hostBridge: HostBridgeRef;
  readonly storeKey: WidgetRunStoreKey;
  readonly conversationStorageKey: string | undefined;
  /** Fall back to conversation history when a run can no longer be replayed. */
  readonly onReplayExpired: (conversationId: string | undefined) => void;
  /** Refetch one conversation's stored transcript (e.g. a turn finished while away). */
  readonly refreshHistory: (conversationId: string | undefined) => void;
};

/**
 * Own the live run for a widget instance: create, subscribe, reconnect, cancel.
 *
 * The durable owner is the module run store; this hook is a thin React driver
 * that subscribes to it and delegates transport work to the subscription
 * lifecycle helpers. A single active-subscription slot fences the live stream so
 * a new run or an explicit clear stops the previous one without clobbering newer
 * state. Inputs are read through a ref so the callbacks stay stable and the
 * mount/visibility reconnect effect never refires.
 */
export const useWidgetRunController = (input: WidgetRunControllerInput): WidgetRunController => {
  const store = getWidgetRunStore(input.storeKey);
  const run = useStoreSnapshot(store);
  const contextRef = useLatestRef<RunLifecycleContext>(input);
  const subscriptionRef = useRef<ActiveSubscription>({ controller: undefined, turnId: undefined });
  // Guards the async marker-resume (history load + seed) so repeated reconnect
  // triggers during a full reload do not seed the run twice.
  const resumingRef = useRef(false);

  const subscribe = useCallback(
    (target: SubscribeTarget) => {
      const active = subscriptionRef.current;
      const signal = openSubscription(active, target.assistantTurnId);
      if (!signal) return;
      const controller = active.controller;
      void driveSubscription(contextRef.current, store, target, signal).finally(() => {
        // Release the slot when this exact subscription ends so a later reconnect
        // (e.g. the stream closed without a terminal) can reopen the same turn.
        if (active.controller === controller) releaseSubscription(active);
      });
    },
    [contextRef, store],
  );

  const startRun = useCallback(
    (startInput: StartRunInput) => beginRun(contextRef.current, store, subscribe, startInput),
    [contextRef, store, subscribe],
  );

  const reconnect = useCallback(() => {
    // In-session run: resubscribe from the live cursor. Empty store (full reload):
    // rebuild from the persisted marker — seed from history, then replay from -1.
    if (store.getSnapshot()) {
      const target = resumeTarget(store);
      if (target) subscribe(target);
      return;
    }
    if (resumingRef.current) return;
    resumingRef.current = true;
    void resumeRunFromMarker(contextRef.current, store, subscribe).finally(() => {
      resumingRef.current = false;
    });
  }, [contextRef, store, subscribe]);

  const cancel = useCallback(() => cancelRun(contextRef.current, store), [contextRef, store]);

  const clearRun = useCallback(() => {
    abortSubscription(subscriptionRef.current);
    clearActiveRunMarker(contextRef.current.conversationStorageKey);
    store.clear();
  }, [contextRef, store]);

  return { run, startRun, reconnect, cancel, clearRun };
};

const useStoreSnapshot = (store: WidgetRunStore): WidgetRunState | undefined =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

const useLatestRef = <T>(value: T) => {
  const ref = useRef(value);
  ref.current = value;
  return ref;
};
