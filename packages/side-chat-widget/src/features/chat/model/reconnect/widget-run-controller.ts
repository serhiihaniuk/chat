import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import {
  acquireWidgetRunInstance,
  getWidgetRunStore,
  getWidgetSubscriptionSlot,
  releaseWidgetRunInstance,
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
  type BeginRunControl,
  type HostBridgeRef,
  type RunLifecycleContext,
  type StartRunInput,
  type SubscribeTarget,
} from "../subscription/widget-subscription-lifecycle.js";
import {
  resumeFromActiveTurn,
  resumeRunFromMarker,
  resumeTarget,
  type ResumeFromActiveTurnInput,
} from "../subscription/widget-run-resume.js";
import { clearActiveRunMarker } from "./widget-run-marker.js";
import type { SideChatApiClient } from "#entities/conversation";

export type { StartRunInput } from "../subscription/widget-subscription-lifecycle.js";

export type WidgetRunController = {
  /** Current live run, or undefined when idle. Read via `useSyncExternalStore`. */
  readonly run: WidgetRunState | undefined;
  /**
   * The store's live run snapshot, for async callbacks that must decide against
   * the freshest state (not a render-captured value). Reading the store directly
   * closes the render/effect timing window a ref snapshot would leave open.
   */
  readonly getRun: () => WidgetRunState | undefined;
  /** Start a fresh run: create on the server, persist a marker, then subscribe. */
  readonly startRun: (input: StartRunInput) => Promise<void>;
  /** Resume the active run (mount / visibility / online / conversation select). */
  readonly reconnect: () => void;
  /** Resume the running turn a history read reported, when no run is tracked yet. */
  readonly resumeFromHistory: (input: ResumeFromActiveTurnInput) => void;
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
  readonly refreshHistory: (conversationId: string | undefined) => void | Promise<unknown>;
  /** Watchdog window: no stream event for this long cuts and retries the connection (default 45 s). */
  readonly inactivityTimeoutMs?: number | undefined;
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
  // The live-subscription slot is module-scoped and shared across mounts (keyed
  // like the store), so a remount adopts the in-flight stream via `openSubscription`
  // instead of opening a second one — never a per-mount `useRef`.
  const subscription = getWidgetSubscriptionSlot(input.storeKey);
  // Guards the async marker-resume (history load + seed) so repeated reconnect
  // triggers during a full reload do not seed the run twice.
  const resumingRef = useRef(false);

  // Refcount this mount so the last owner's unmount aborts the shared subscription
  // (leak fix), while a StrictMode/fast remount re-acquires and adopts it.
  useRunInstanceLifecycle(input.storeKey);

  const subscribe = useCallback(
    (target: SubscribeTarget) => {
      const signal = openSubscription(subscription, target.assistantTurnId);
      if (!signal) return;
      const controller = subscription.controller;
      void driveSubscription(contextRef.current, store, target, signal).finally(() => {
        // Release the slot when this exact subscription ends so a later reconnect
        // (e.g. the stream closed without a terminal) can reopen the same turn.
        if (subscription.controller === controller) releaseSubscription(subscription);
      });
    },
    [contextRef, store, subscription],
  );

  const startRun = useCallback(
    (startInput: StartRunInput) =>
      startRunWithSlot(contextRef.current, store, subscription, startInput),
    [contextRef, store, subscription],
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

  const resumeFromHistory = useCallback(
    (input: ResumeFromActiveTurnInput) => {
      // The server (via a history read's activeTurn) says a turn is running. Seed
      // only when nothing is tracked yet, so this never double-seeds a run the
      // marker resume or an in-session stream already owns.
      if (store.getSnapshot()) return;
      resumeFromActiveTurn(store, subscribe, input);
    },
    [store, subscribe],
  );

  const cancel = useCallback(() => cancelRun(contextRef.current, store), [contextRef, store]);

  const clearRun = useCallback(() => {
    abortSubscription(subscription);
    clearActiveRunMarker(contextRef.current.conversationStorageKey);
    store.clear();
  }, [contextRef, store, subscription]);

  return {
    run,
    getRun: store.getSnapshot,
    startRun,
    reconnect,
    resumeFromHistory,
    cancel,
    clearRun,
  };
};

/**
 * Start a fresh run, claiming the active-subscription slot before the POST.
 *
 * A fresh run replaces any live stream: the old subscription is aborted and the
 * new controller registered first, so cancel/clear can abort the in-flight
 * create and its connection-bound stream. The slot's turn id lands once the
 * identity frame arrives.
 */
const startRunWithSlot = (
  context: RunLifecycleContext,
  store: WidgetRunStore,
  active: ActiveSubscription,
  startInput: StartRunInput,
): Promise<void> => {
  active.controller?.abort();
  const controller = new AbortController();
  active.controller = controller;
  active.turnId = undefined;
  const control: BeginRunControl = {
    signal: controller.signal,
    onIdentified: (assistantTurnId) => {
      if (active.controller === controller) active.turnId = assistantTurnId;
    },
  };
  return beginRun(context, store, control, startInput).finally(() => {
    if (active.controller === controller) releaseSubscription(active);
  });
};

/** Refcount this mount against the shared run instance (adopt on remount, abort on last unmount). */
const useRunInstanceLifecycle = (storeKey: WidgetRunStoreKey): void => {
  const { storageKey, baseUrl } = storeKey;
  useEffect(() => {
    const key = { storageKey, baseUrl };
    acquireWidgetRunInstance(key);
    return () => releaseWidgetRunInstance(key);
  }, [storageKey, baseUrl]);
};

const useStoreSnapshot = (store: WidgetRunStore): WidgetRunState | undefined =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

const useLatestRef = <T>(value: T) => {
  const ref = useRef(value);
  ref.current = value;
  return ref;
};
