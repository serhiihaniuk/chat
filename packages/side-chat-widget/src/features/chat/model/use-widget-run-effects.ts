import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import {
  WIDGET_RUN_STATUSES,
  isTerminalRunStatus,
  type WidgetRunState,
} from "./run/widget-run-state.js";
import { refreshConversationsAfterStream } from "./conversation/widget-title-refresh.js";
import type { RunShellBridge } from "./conversation/shell/run-shell-bridge.js";
import type {
  ReadHistoryResult,
  RefreshConversations,
  RefreshHistory,
} from "#entities/conversation";

type SetConversationId = Dispatch<SetStateAction<string | undefined>>;
type SetError = Dispatch<SetStateAction<string | undefined>>;

type UpsertStartedConversation = (input: {
  readonly conversationId: string;
  readonly fallbackTitle: string;
  readonly lastMessageAt: string;
}) => void;

export type WidgetRunEffectsInput = {
  readonly run: WidgetRunState | undefined;
  readonly setConversationId: SetConversationId;
  readonly setErrorMessage: SetError;
  /** Shared run↔shell state (stream-owned conversation, pending title). */
  readonly shellBridge: RunShellBridge;
  readonly refreshConversations: RefreshConversations;
  readonly upsertStartedConversation: UpsertStartedConversation;
  readonly refreshHistory: RefreshHistory;
  /** Read the external run store at async completion, before React may re-render. */
  readonly getRun: () => WidgetRunState | undefined;
  /** Forget the live run (subscription, marker, store) once history has taken over. */
  readonly clearRun: () => void;
};

/**
 * Connect live run milestones to the conversation list and history.
 *
 * These effects handle three transitions: assign a conversation id, refresh the
 * list after completion, and hand the finished transcript to history. Ref guards
 * make each transition run once while dependencies remain explicit.
 */
export const useWidgetRunEffects = (input: WidgetRunEffectsInput): void => {
  useAdoptStartedConversation(input);
  useRefreshAfterRunCompletes(input);
  useHistoryHandoffAfterTerminal(input);
};

const useAdoptStartedConversation = (input: WidgetRunEffectsInput): void => {
  const { run, setConversationId, shellBridge, upsertStartedConversation } = input;
  const conversationId = run?.conversationId;
  const requestId = run?.requestId;
  // Adopt the server-assigned conversation exactly once per run. Guarding by the
  // run's request id (not the bridge's stream-owned field) means a later explicit
  // `selectConversation` — which resets that field — cannot re-trigger adoption and
  // yank the user back to the in-flight turn on the next streamed event.
  const adoptedRequestRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!conversationId || !run || !requestId) return;
    if (adoptedRequestRef.current === requestId) return;
    adoptedRequestRef.current = requestId;

    // The live run owns these messages until the user reselects the conversation,
    // so guard history refetch and adopt the server-assigned id.
    shellBridge.adoptConversation(conversationId);
    setConversationId(conversationId);

    const fallbackTitle = shellBridge.getSnapshot().pendingConversationTitle;
    if (fallbackTitle) {
      upsertStartedConversation({
        conversationId,
        fallbackTitle,
        lastMessageAt: lastMessageAt(run),
      });
    }
  }, [conversationId, requestId, run, setConversationId, shellBridge, upsertStartedConversation]);
};

const useRefreshAfterRunCompletes = (input: WidgetRunEffectsInput): void => {
  const { run, shellBridge, refreshConversations, setErrorMessage } = input;
  const completedRequestRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!run || run.status !== WIDGET_RUN_STATUSES.COMPLETED) return;
    if (completedRequestRef.current === run.requestId) return;
    completedRequestRef.current = run.requestId;

    void refreshConversationsAfterStream({
      activeConversationId:
        run.conversationId ?? shellBridge.getSnapshot().streamOwnedConversationId,
      fallbackTitle: shellBridge.getSnapshot().pendingConversationTitle,
      refreshConversations,
      setErrorMessage,
    });
  }, [refreshConversations, run, setErrorMessage, shellBridge]);
};

/** Retries for a refetch that still reports the finishing turn as running. */
const HANDOFF_SETTLE_ATTEMPTS = 3;
const HANDOFF_SETTLE_DELAY_MS = 250;

/**
 * Move a finished run to server history: fetch first, then clear (ADR 0007).
 *
 * Fetching first keeps the answer visible at every moment. Do not clear when the
 * refresh failed, there is no conversation id, or a newer run replaced this one.
 * For a failed run, copy its error notice into shell state before clearing the
 * run, because the run is the only place that currently holds that notice.
 */
const useHistoryHandoffAfterTerminal = (input: WidgetRunEffectsInput): void => {
  const { run, refreshHistory, clearRun, getRun, setErrorMessage, shellBridge } = input;
  const handedOffRequestRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!run || !isTerminalRunStatus(run.status)) return;
    if (handedOffRequestRef.current === run.requestId) return;
    handedOffRequestRef.current = run.requestId;

    void handOffRunToHistory(run, refreshHistory).then((handedOff) => {
      if (!handedOff) return;
      if (getRun()?.requestId !== run.requestId) return;
      if (run.errorMessage) setErrorMessage(run.errorMessage);
      shellBridge.releaseStreamOwnership();
      clearRun();
    });
  }, [clearRun, getRun, refreshHistory, run, setErrorMessage, shellBridge]);
};

/**
 * Refetch the conversation until the server no longer reports this turn running.
 *
 * The terminal stream event can beat the durable status commit by a moment, so a
 * refetch may briefly return `activeTurn: running` without the final message. A
 * short bounded retry rides that out; if the server never settles, the run stays
 * visible instead of the answer disappearing.
 */
const handOffRunToHistory = async (
  run: WidgetRunState,
  refreshHistory: RefreshHistory,
): Promise<boolean> => {
  if (!run.conversationId) return false;
  for (let attempt = 0; attempt < HANDOFF_SETTLE_ATTEMPTS; attempt += 1) {
    const history = await refreshHistory(run.conversationId);
    if (!history) return false;
    if (!isTurnStillRunning(history, run.assistantTurnId)) return true;
    await delay(HANDOFF_SETTLE_DELAY_MS);
  }
  return false;
};

const isTurnStillRunning = (
  history: ReadHistoryResult,
  assistantTurnId: string | undefined,
): boolean =>
  assistantTurnId !== undefined &&
  history.activeTurn?.assistantTurnId === assistantTurnId &&
  history.activeTurn.status === "running";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const lastMessageAt = (run: WidgetRunState): string => {
  const startedAt = run.messages.at(-1)?.activity.startedAt;
  return startedAt ?? new Date().toISOString();
};
