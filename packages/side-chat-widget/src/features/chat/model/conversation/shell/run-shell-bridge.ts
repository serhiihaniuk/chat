import { useSyncExternalStore } from "react";

/** Conversation-shell values derived from the current live-run lifecycle. */
export type RunShellSnapshot = {
  readonly streamOwnedConversationId: string | undefined;
  readonly pendingConversationTitle: string | undefined;
};

/**
 * Reactive boundary between the live run and the conversation shell.
 *
 * Lifecycle methods replace a private immutable snapshot and notify React. This
 * keeps history-loading and activity-refresh decisions current without exposing
 * mutable fields that another module can change without causing a render.
 */
export type RunShellBridge = {
  readonly getSnapshot: () => RunShellSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly markTurnSubmitted: (fallbackTitle: string) => void;
  readonly adoptConversation: (conversationId: string) => void;
  readonly releaseStreamOwnership: () => void;
  readonly resetForConversationSelection: () => void;
};

const EMPTY_SNAPSHOT: RunShellSnapshot = Object.freeze({
  streamOwnedConversationId: undefined,
  pendingConversationTitle: undefined,
});

export const createRunShellBridge = (): RunShellBridge => {
  let snapshot = EMPTY_SNAPSHOT;
  const listeners = new Set<() => void>();

  const publish = (next: RunShellSnapshot): void => {
    if (snapshotsMatch(snapshot, next)) return;
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    markTurnSubmitted: (fallbackTitle) => {
      publish({ ...snapshot, pendingConversationTitle: fallbackTitle });
    },
    adoptConversation: (conversationId) => {
      publish({ ...snapshot, streamOwnedConversationId: conversationId });
    },
    releaseStreamOwnership: () => {
      publish({ ...snapshot, streamOwnedConversationId: undefined });
    },
    resetForConversationSelection: () => {
      publish(EMPTY_SNAPSHOT);
    },
  };
};

export const useRunShellSnapshot = (bridge: RunShellBridge): RunShellSnapshot =>
  useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot);

const snapshotsMatch = (left: RunShellSnapshot, right: RunShellSnapshot): boolean =>
  left.streamOwnedConversationId === right.streamOwnedConversationId &&
  left.pendingConversationTitle === right.pendingConversationTitle;
