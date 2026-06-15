import type { ChatClient } from "@side-chat/chat-client";
import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";

import { toErrorMessage, type WidgetMessage, type WidgetStatus } from "#entities/chat";
import {
  toWidgetConversationSummary,
  toWidgetHistoryMessages,
  writeWidgetConversationStore,
  type WidgetConversationSummary,
} from "./widget-conversations.js";

type SetWidgetMessages = Dispatch<SetStateAction<WidgetMessage[]>>;
type SetWidgetError = Dispatch<SetStateAction<string | undefined>>;
type SetWidgetConversations = Dispatch<SetStateAction<readonly WidgetConversationSummary[]>>;

export const useConversationList = (
  client: ChatClient,
  setConversations: SetWidgetConversations,
  setErrorMessage: SetWidgetError,
) => {
  const loadConversations = useCallback(
    (signal?: AbortSignal) => loadConversationSummaries(client, setConversations, signal),
    [client, setConversations],
  );

  useEffect(() => {
    const abortController = new AbortController();
    void loadConversations(abortController.signal).catch(
      reportAbortableError(abortController.signal, setErrorMessage),
    );
    return () => abortController.abort();
  }, [loadConversations, setErrorMessage]);

  return loadConversations;
};

export const usePersistConversationStore = (
  conversationStorageKey: string | undefined,
  conversationId: string | undefined,
  conversations: readonly WidgetConversationSummary[],
): void => {
  useEffect(() => {
    writeWidgetConversationStore(conversationStorageKey, {
      activeConversationId: conversationId,
      conversations,
    });
  }, [conversationId, conversationStorageKey, conversations]);
};

export const useConversationHistory = (
  client: ChatClient,
  conversationId: string | undefined,
  status: WidgetStatus,
  setMessages: SetWidgetMessages,
  setErrorMessage: SetWidgetError,
): void => {
  useEffect(() => {
    if (!conversationId || !client.readHistory || isBusyStatus(status)) return undefined;

    const abortController = new AbortController();
    void loadConversationHistory(
      client,
      conversationId,
      setMessages,
      setErrorMessage,
      abortController.signal,
    );
    return () => abortController.abort();
  }, [client, conversationId, setErrorMessage, setMessages, status]);
};

const loadConversationSummaries = async (
  client: ChatClient,
  setConversations: SetWidgetConversations,
  signal?: AbortSignal,
): Promise<void> => {
  if (!client.listConversations) return;
  const result = await client.listConversations({ limit: 25, signal });
  setConversations(result.conversations.map(toWidgetConversationSummary));
};

const loadConversationHistory = async (
  client: ChatClient,
  conversationId: string,
  setMessages: SetWidgetMessages,
  setErrorMessage: SetWidgetError,
  signal: AbortSignal,
): Promise<void> => {
  try {
    const history = await client.readHistory?.(conversationId, { limit: 100, signal });
    if (!signal.aborted && history) setMessages([...toWidgetHistoryMessages(history)]);
  } catch (error) {
    if (!signal.aborted) setErrorMessage(toErrorMessage(error));
  }
};

const reportAbortableError =
  (signal: AbortSignal, setErrorMessage: SetWidgetError) =>
  (error: unknown): void => {
    if (!signal.aborted) setErrorMessage(toErrorMessage(error));
  };

const isBusyStatus = (status: WidgetStatus): boolean =>
  status === "submitted" || status === "streaming";
