import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";

import { toErrorMessage, type WidgetMessage } from "#entities/chat";
import {
  writeWidgetConversationStore,
  type WidgetConversationSummary,
  type ReadHistoryResult,
} from "#entities/conversation";
import { toWidgetHistoryMessages } from "./widget-conversations.js";

type SetWidgetError = Dispatch<SetStateAction<string | undefined>>;

export const usePersistConversationStore = ({
  conversationId,
  conversationStorageKey,
  conversations,
}: {
  readonly conversationId: string | undefined;
  readonly conversationStorageKey: string | undefined;
  readonly conversations: readonly WidgetConversationSummary[];
}): void => {
  useEffect(() => {
    writeWidgetConversationStore(conversationStorageKey, {
      activeConversationId: conversationId,
      conversations,
    });
  }, [conversationId, conversationStorageKey, conversations]);
};

export const useConversationQueryErrors = ({
  conversationsError,
  historyError,
  setErrorMessage,
  shouldLoadHistory,
}: {
  readonly conversationsError: unknown;
  readonly historyError: unknown;
  readonly setErrorMessage: SetWidgetError;
  readonly shouldLoadHistory: boolean;
}): void => {
  useEffect(() => {
    if (conversationsError) setErrorMessage(toErrorMessage(conversationsError));
  }, [conversationsError, setErrorMessage]);

  useEffect(() => {
    if (historyError && shouldLoadHistory) setErrorMessage(toErrorMessage(historyError));
  }, [historyError, setErrorMessage, shouldLoadHistory]);
};

/**
 * Derive the displayed transcript for a selected conversation from its history.
 *
 * Pure projection: the live run owns messages while it is visible, so this only
 * supplies the stored transcript when no run is shown. It returns `undefined`
 * until the matching conversation's history has loaded so callers can fall back
 * to an empty list rather than flashing a stale conversation.
 */
export const useConversationHistoryMessages = ({
  conversationId,
  history,
  shouldLoadHistory,
}: {
  readonly conversationId: string | undefined;
  readonly history: ReadHistoryResult | undefined;
  readonly shouldLoadHistory: boolean;
}): readonly WidgetMessage[] | undefined =>
  useMemo(() => {
    if (!shouldLoadHistory || !history || history.conversationId !== conversationId) {
      return undefined;
    }
    return [...toWidgetHistoryMessages(history)];
  }, [conversationId, history, shouldLoadHistory]);

/**
 * Resume an in-flight turn the server reports on a history read.
 *
 * `activeTurn` is the authoritative, marker-independent resume signal: when a
 * history read says a turn is still running, reconnect to it (seed the loaded
 * transcript + replay the buffered stream). This covers a fresh device or a missing/
 * stale local marker. The controller no-ops when a run is already tracked, so this
 * never competes with the marker resume or an in-session stream.
 */
export const useResumeActiveTurn = ({
  history,
  historyMessages,
  resumeActiveTurn,
}: {
  readonly history: ReadHistoryResult | undefined;
  readonly historyMessages: readonly WidgetMessage[] | undefined;
  readonly resumeActiveTurn: (input: {
    readonly conversationId: string | undefined;
    readonly assistantTurnId: string;
    readonly seedMessages: readonly WidgetMessage[];
  }) => void;
}): void => {
  const conversationId = history?.conversationId;
  const assistantTurnId = history?.activeTurn?.assistantTurnId;
  const isRunning = history?.activeTurn?.status === "running";

  useEffect(() => {
    if (!isRunning || !assistantTurnId) return;
    resumeActiveTurn({ conversationId, assistantTurnId, seedMessages: historyMessages ?? [] });
  }, [assistantTurnId, conversationId, historyMessages, isRunning, resumeActiveTurn]);
};
