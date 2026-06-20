import type { ChatModelPreference, SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";
import { useCallback, useRef, useState, type SetStateAction } from "react";

import {
  completeActivityTimeline,
  createId,
  createWidgetChatRequest,
  createWidgetMessage,
  findLastUserMessage,
  messagesBeforeMessage,
  toErrorMessage,
  updateMessage,
  type WidgetMessage,
  type WidgetStatus,
  type WidgetUsage,
} from "#entities/chat";
import {
  readWidgetConversationStore,
  useConversationQueryRepository,
  useGetConversationHistory,
  useGetConversations,
  type SideChatApiClient,
} from "#entities/conversation";
import {
  useConversationHistoryMessages,
  useConversationQueryErrors,
  usePersistConversationStore,
} from "./conversation/widget-conversation-query-effects.js";
import { refreshConversationsAfterStream } from "./conversation/widget-title-refresh.js";
import { useWidgetStreamEventHandlers } from "./stream/widget-stream-handlers.js";

export const useWidgetChat = ({
  client,
  conversationStorageKey,
  hostBridge,
  selectedProfileId,
  selectedModel,
}: {
  readonly client: SideChatApiClient;
  readonly conversationStorageKey: string | undefined;
  readonly hostBridge: Pick<HostBridge, "getContext" | "dispatchCommand"> | undefined;
  readonly selectedModel: ChatModelPreference | undefined;
  readonly selectedProfileId: string | undefined;
}) => {
  const initialConversationStore = useRef(readWidgetConversationStore(conversationStorageKey));
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [status, setStatus] = useState<WidgetStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [usage, setUsage] = useState<WidgetUsage | undefined>();
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationStore.current.activeConversationId,
  );
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const pendingConversationTitleRef = useRef<string | undefined>(undefined);
  // Id established by the current stream. History must not refetch it because
  // the live event loop already owns those messages until the user reselects it.
  const streamOwnedConversationRef = useRef<string | undefined>(undefined);
  const conversationsQuery = useGetConversations({
    activeConversationId: conversationId,
    client,
    initialConversations: initialConversationStore.current.conversations,
  });
  const { refreshConversations, upsertStartedConversation } = useConversationQueryRepository({
    activeConversationId: conversationId,
    client,
    initialConversations: initialConversationStore.current.conversations,
  });
  const shouldLoadHistory =
    conversationId !== undefined &&
    client.readHistory !== undefined &&
    conversationId !== streamOwnedConversationRef.current;
  const historyQuery = useGetConversationHistory({
    client,
    conversationId,
    enabled: shouldLoadHistory,
  });
  const applyStreamEvent = useWidgetStreamEventHandlers({
    hostBridge,
    pendingConversationTitleRef,
    setConversationId,
    setErrorMessage,
    setMessages,
    setStatus,
    setUsage,
    streamOwnedConversationRef,
    upsertStartedConversation,
  });
  const conversations = conversationsQuery.data ?? [];
  const historyMessages = useConversationHistoryMessages({
    conversationId,
    history: historyQuery.data,
    setMessages,
    shouldLoadHistory,
  });
  const visibleMessages =
    messages.length > 0 || status === "submitted" || status === "streaming"
      ? messages
      : (historyMessages ?? messages);
  const isLoadingHistory = shouldLoadHistory && historyQuery.isPending && !historyQuery.data;

  usePersistConversationStore({ conversationId, conversationStorageKey, conversations });
  useConversationQueryErrors({
    conversationsError: conversationsQuery.error,
    historyError: historyQuery.error,
    setErrorMessage,
    shouldLoadHistory,
  });

  const submitMessage = useCallback(
    async (messageText: string) => {
      const trimmed = messageText.trim();
      if (isSubmitBlocked(trimmed, status)) return;

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const requestId = createId("request");
      const userMessageId = createId("user");
      const assistantMessageId = createId("assistant");
      const userMessage = createWidgetMessage(userMessageId, "user", trimmed);
      const assistantMessage = createWidgetMessage(assistantMessageId, "assistant", "", true);

      pendingConversationTitleRef.current = trimmed;
      setMessages(appendPendingMessages(userMessage, assistantMessage));
      setStatus("submitted");
      setErrorMessage(undefined);

      try {
        const hostContext = await hostBridge?.getContext({ requestId });
        const request = createWidgetChatRequest({
          turnProfileId: selectedProfileId,
          conversationId,
          hostContext,
          message: trimmed,
          messageId: userMessageId,
          model: selectedModel,
          requestId,
        });

        const result = await client.streamChat(request, {
          signal: abortController.signal,
        });
        setStatus("streaming");

        await consumeStreamEvents(
          result.events,
          abortController.signal,
          applyStreamEvent,
          assistantMessageId,
        );

        if (!isActiveRequest(abortControllerRef, abortController)) return;
        const activeConversationId = streamOwnedConversationRef.current ?? conversationId;
        const fallbackTitle = pendingConversationTitleRef.current;
        pendingConversationTitleRef.current = undefined;
        setMessages(completeAssistantMessageFor(assistantMessageId));
        setStatus((current) => (current === "error" ? current : "idle"));
        await refreshConversationsAfterStream({
          activeConversationId,
          fallbackTitle,
          refreshConversations,
          setErrorMessage,
        });
      } catch (error) {
        if (!isActiveRequest(abortControllerRef, abortController)) return;
        pendingConversationTitleRef.current = undefined;
        setMessages(completeAssistantMessageFor(assistantMessageId));

        if (abortController.signal.aborted) {
          setStatus("idle");
          return;
        }

        setStatus("error");
        setErrorMessage(toErrorMessage(error));
      }
    },
    [
      applyStreamEvent,
      client,
      conversationId,
      refreshConversations,
      hostBridge,
      selectedProfileId,
      selectedModel,
      status,
    ],
  );

  const selectConversation = useCallback((nextConversationId: string | undefined) => {
    abortControllerRef.current?.abort();
    pendingConversationTitleRef.current = undefined;
    // Explicit selection always wants fresh history, so release the no-refetch guard.
    streamOwnedConversationRef.current = undefined;
    setConversationId(nextConversationId);
    setMessages([]);
    setUsage(undefined);
    setErrorMessage(undefined);
    setStatus("idle");
  }, []);

  const startNewConversation = useCallback(() => {
    selectConversation(undefined);
  }, [selectConversation]);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(undefined);
    setStatus(clearErrorStatus);
  }, []);

  const retryLastMessage = useCallback(() => {
    const lastUserMessage = findLastUserMessage(messages);
    if (!lastUserMessage) return;
    setMessages(messagesBeforeMessage(messages, lastUserMessage));
    setErrorMessage(undefined);
    void submitMessage(lastUserMessage.content);
  }, [messages, submitMessage]);

  return {
    clearError,
    conversationId,
    conversations,
    errorMessage,
    isLoadingHistory,
    messages: visibleMessages,
    retryLastMessage,
    selectConversation,
    setErrorMessage,
    status,
    startNewConversation,
    stop,
    submitMessage,
    usage,
  };
};

type ActiveRequestRef = { readonly current: AbortController | undefined };
type ApplyWidgetStreamEvent = (
  event: SidechatStreamEvent,
  assistantMessageId: string,
) => Promise<void>;

const appendPendingMessages =
  (userMessage: WidgetMessage, assistantMessage: WidgetMessage): SetStateAction<WidgetMessage[]> =>
  (current) => [...current, userMessage, assistantMessage];

const completeAssistantMessageFor =
  (assistantMessageId: string): SetStateAction<WidgetMessage[]> =>
  (current) =>
    updateMessage(current, assistantMessageId, (message) => ({
      ...message,
      activity: completeActivityTimeline(message.activity),
      isStreaming: false,
    }));

const isActiveRequest = (requestRef: ActiveRequestRef, abortController: AbortController): boolean =>
  requestRef.current === abortController;

const clearErrorStatus = (status: WidgetStatus): WidgetStatus =>
  status === "error" ? "idle" : status;

const isSubmitBlocked = (message: string, status: WidgetStatus): boolean =>
  !message || status === "submitted" || status === "streaming";

const consumeStreamEvents = async (
  events: AsyncIterable<SidechatStreamEvent>,
  signal: AbortSignal,
  applyStreamEvent: ApplyWidgetStreamEvent,
  assistantMessageId: string,
): Promise<void> => {
  for await (const event of events) {
    if (signal.aborted) break;
    await applyStreamEvent(event, assistantMessageId);
  }
};
