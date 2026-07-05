import {
  abortSubscription,
  type ActiveSubscription,
} from "../subscription/widget-subscription-lifecycle.js";
import { widgetRunReducer, type WidgetRunAction } from "./widget-run-reducer.js";
import {
  createWidgetRunState,
  type WidgetRunSeed,
  type WidgetRunState,
} from "./widget-run-state.js";

type Listener = () => void;

/**
 * Durable owner of one widget instance's live run, outside React state.
 *
 * The store is module-level so a component remount, pane switch, or settings
 * toggle never forgets an in-flight turn: the hook re-subscribes and reads the
 * current snapshot. It applies an ordered event log through the pure reducer and
 * notifies React via `useSyncExternalStore`. There is at most one active run per
 * instance; starting a new run replaces it.
 */
export type WidgetRunStore = {
  /** Begin a new run, replacing any current one, and return its initial state. */
  readonly start: (seed: WidgetRunSeed) => WidgetRunState;
  /**
   * Apply an action to the run matching `requestId`. A stale dispatch (the run was
   * replaced) is ignored so a late stream callback cannot clobber a newer run.
   */
  readonly dispatch: (requestId: string, action: WidgetRunAction) => void;
  /** Forget the current run (e.g. on replay_expired fallback or conversation switch). */
  readonly clear: () => void;
  readonly getSnapshot: () => WidgetRunState | undefined;
  readonly subscribe: (listener: Listener) => () => void;
};

const createWidgetRunStore = (): WidgetRunStore => {
  let state: WidgetRunState | undefined;
  const listeners = new Set<Listener>();

  const setState = (next: WidgetRunState | undefined): void => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    start: (seed) => {
      const next = createWidgetRunState(seed);
      setState(next);
      return next;
    },
    dispatch: (requestId, action) => {
      if (!state || state.requestId !== requestId) return;
      setState(widgetRunReducer(state, action));
    },
    clear: () => setState(undefined),
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

/**
 * Identity of one widget instance + service for run ownership.
 *
 * Two widgets in the same page (different storage keys) or pointed at different
 * services get independent run stores, so their live turns never cross.
 */
export type WidgetRunStoreKey = {
  readonly storageKey: string | undefined;
  readonly baseUrl: string | undefined;
};

/**
 * Module-scoped run ownership for one widget identity, shared across mounts.
 *
 * The store AND the live-subscription slot both live here, not in a per-mount
 * `useRef`, so a remount adopts the in-flight stream instead of opening a second
 * one. `refCount` tracks how many controllers are mounted; when the last one
 * leaves, the subscription is aborted so a removed widget never leaks its SSE.
 */
type WidgetRunInstance = {
  readonly store: WidgetRunStore;
  readonly subscription: ActiveSubscription;
  refCount: number;
  pendingRelease: ReturnType<typeof setTimeout> | undefined;
};

const registry = new Map<string, WidgetRunInstance>();

const toRegistryKey = (key: WidgetRunStoreKey): string =>
  `${key.storageKey ?? "anonymous"}::${key.baseUrl ?? "default"}`;

const getInstance = (key: WidgetRunStoreKey): WidgetRunInstance => {
  const registryKey = toRegistryKey(key);
  const existing = registry.get(registryKey);
  if (existing) return existing;

  const instance: WidgetRunInstance = {
    store: createWidgetRunStore(),
    subscription: { controller: undefined, turnId: undefined },
    refCount: 0,
    pendingRelease: undefined,
  };
  registry.set(registryKey, instance);
  return instance;
};

/** Resolve (creating once) the run store for a widget instance + service. */
export const getWidgetRunStore = (key: WidgetRunStoreKey): WidgetRunStore => getInstance(key).store;

/**
 * The shared live-subscription slot for a widget identity.
 *
 * Returned by reference so every mount of the same widget reads and writes one
 * slot — the basis for remount adoption (see `openSubscription`).
 */
export const getWidgetSubscriptionSlot = (key: WidgetRunStoreKey): ActiveSubscription =>
  getInstance(key).subscription;

/** Register one mounted controller; cancels a pending last-owner teardown. */
export const acquireWidgetRunInstance = (key: WidgetRunStoreKey): void => {
  const instance = getInstance(key);
  if (instance.pendingRelease !== undefined) {
    clearTimeout(instance.pendingRelease);
    instance.pendingRelease = undefined;
  }
  instance.refCount += 1;
};

/**
 * Unregister one mounted controller; abort the live stream only if it was last.
 *
 * The abort is deferred a macrotask so a StrictMode (or fast) remount, whose
 * `acquire` cancels it, adopts the live stream instead of reopening it. A widget
 * truly removed from the DOM leaves no re-acquire, so the deferred abort fires
 * and its SSE connection closes — no leak.
 */
export const releaseWidgetRunInstance = (key: WidgetRunStoreKey): void => {
  const instance = getInstance(key);
  instance.refCount = Math.max(0, instance.refCount - 1);
  if (instance.refCount > 0 || instance.pendingRelease !== undefined) return;
  instance.pendingRelease = setTimeout(() => {
    instance.pendingRelease = undefined;
    if (instance.refCount === 0) abortSubscription(instance.subscription);
  }, 0);
};

/** Drop every store. Test-only seam so module state never leaks across cases. */
export const resetWidgetRunStores = (): void => {
  for (const instance of registry.values()) {
    if (instance.pendingRelease !== undefined) clearTimeout(instance.pendingRelease);
    abortSubscription(instance.subscription);
  }
  registry.clear();
};
