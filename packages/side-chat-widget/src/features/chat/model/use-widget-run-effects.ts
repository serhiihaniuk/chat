import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { WIDGET_RUN_STATUSES, type WidgetRunState } from "./run/widget-run-state.js";
import { refreshConversationsAfterStream } from "./conversation/widget-title-refresh.js";
import type { RefreshConversations } from "#entities/conversation";

type SetConversationId = Dispatch<SetStateAction<string | undefined>>;
type SetError = Dispatch<SetStateAction<string | undefined>>;
type MutableConversationRef = { current: string | undefined };
type PendingTitleRef = { readonly current: string | undefined };

type UpsertStartedConversation = (input: {
  readonly conversationId: string;
  readonly fallbackTitle: string;
  readonly lastMessageAt: string;
}) => void;

export type WidgetRunEffectsInput = {
  readonly run: WidgetRunState | undefined;
  readonly setConversationId: SetConversationId;
  readonly setErrorMessage: SetError;
  readonly streamOwnedConversationRef: MutableConversationRef;
  readonly pendingConversationTitleRef: PendingTitleRef;
  readonly refreshConversations: RefreshConversations;
  readonly upsertStartedConversation: UpsertStartedConversation;
};

/**
 * Bridge live run state back into the conversation list and selection.
 *
 * The run store owns messages/status; these effects only react to two run
 * milestones the conversation shell still cares about: the server assigning a
 * conversation id (adopt + optimistically list it), and the run completing
 * (refresh the list so the generated title replaces the optimistic one). Each
 * effect runs once per transition via a ref guard, so including every dependency
 * stays both lint-clean and idempotent.
 */
export const useWidgetRunEffects = (input: WidgetRunEffectsInput): void => {
  useAdoptStartedConversation(input);
  useRefreshAfterRunCompletes(input);
};

const useAdoptStartedConversation = (input: WidgetRunEffectsInput): void => {
  const {
    run,
    setConversationId,
    streamOwnedConversationRef,
    pendingConversationTitleRef,
    upsertStartedConversation,
  } = input;
  const conversationId = run?.conversationId;
  const requestId = run?.requestId;
  // Adopt the server-assigned conversation exactly once per run. Guarding by the
  // run's request id (not the history-refetch ref) means a later explicit
  // `selectConversation` — which resets that ref — cannot re-trigger adoption and
  // yank the user back to the in-flight turn on the next streamed event.
  const adoptedRequestRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!conversationId || !run || !requestId) return;
    if (adoptedRequestRef.current === requestId) return;
    adoptedRequestRef.current = requestId;

    // The live run owns these messages until the user reselects the conversation,
    // so guard history refetch and adopt the server-assigned id.
    streamOwnedConversationRef.current = conversationId;
    setConversationId(conversationId);

    const fallbackTitle = pendingConversationTitleRef.current;
    if (fallbackTitle) {
      upsertStartedConversation({
        conversationId,
        fallbackTitle,
        lastMessageAt: lastMessageAt(run),
      });
    }
  }, [
    conversationId,
    pendingConversationTitleRef,
    requestId,
    run,
    setConversationId,
    streamOwnedConversationRef,
    upsertStartedConversation,
  ]);
};

const useRefreshAfterRunCompletes = (input: WidgetRunEffectsInput): void => {
  const {
    run,
    pendingConversationTitleRef,
    refreshConversations,
    setErrorMessage,
    streamOwnedConversationRef,
  } = input;
  const completedRequestRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!run || run.status !== WIDGET_RUN_STATUSES.COMPLETED) return;
    if (completedRequestRef.current === run.requestId) return;
    completedRequestRef.current = run.requestId;

    void refreshConversationsAfterStream({
      activeConversationId: run.conversationId ?? streamOwnedConversationRef.current,
      fallbackTitle: pendingConversationTitleRef.current,
      refreshConversations,
      setErrorMessage,
    });
  }, [
    pendingConversationTitleRef,
    refreshConversations,
    run,
    setErrorMessage,
    streamOwnedConversationRef,
  ]);
};

const lastMessageAt = (run: WidgetRunState): string => {
  const startedAt = run.messages.at(-1)?.activity.startedAt;
  return startedAt ?? new Date().toISOString();
};
