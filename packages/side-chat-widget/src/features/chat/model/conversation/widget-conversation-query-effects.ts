import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";

import { toErrorMessage, type WidgetMessage } from "#entities/chat";
import {
  writeWidgetConversationStore,
  type WidgetConversationSummary,
  type ReadHistoryResult,
} from "#entities/conversation";
import { toWidgetHistoryMessages } from "./widget-conversations.js";

type SetWidgetMessages = Dispatch<SetStateAction<WidgetMessage[]>>;
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

export const useConversationHistoryMessages = ({
  conversationId,
  history,
  setMessages,
  shouldLoadHistory,
}: {
  readonly conversationId: string | undefined;
  readonly history: ReadHistoryResult | undefined;
  readonly setMessages: SetWidgetMessages;
  readonly shouldLoadHistory: boolean;
}): readonly WidgetMessage[] | undefined => {
  const historyMessages = useMemo(
    () => (history ? [...toWidgetHistoryMessages(history)] : undefined),
    [history],
  );

  useEffect(() => {
    if (!shouldLoadHistory || !history || history.conversationId !== conversationId) return;
    setMessages([...toWidgetHistoryMessages(history)]);
  }, [conversationId, history, setMessages, shouldLoadHistory]);

  return historyMessages;
};
