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

const registry = new Map<string, WidgetRunStore>();

const toRegistryKey = (key: WidgetRunStoreKey): string =>
  `${key.storageKey ?? "anonymous"}::${key.baseUrl ?? "default"}`;

/** Resolve (creating once) the run store for a widget instance + service. */
export const getWidgetRunStore = (key: WidgetRunStoreKey): WidgetRunStore => {
  const registryKey = toRegistryKey(key);
  const existing = registry.get(registryKey);
  if (existing) return existing;

  const store = createWidgetRunStore();
  registry.set(registryKey, store);
  return store;
};

/** Drop every store. Test-only seam so module state never leaks across cases. */
export const resetWidgetRunStores = (): void => {
  registry.clear();
};
