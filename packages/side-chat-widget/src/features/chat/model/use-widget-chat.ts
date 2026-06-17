import type { ChatClient } from "@side-chat/chat-client";
import type { HostBridge } from "@side-chat/host-bridge";
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

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
import { useWidgetStreamEvents } from "./widget-stream-events.js";
import {
  readWidgetConversationStore,
  upsertStartedConversationSummary,
  type WidgetConversationSummary,
} from "./widget-conversations.js";
import {
  useConversationHistory,
  useConversationList,
  usePersistConversationStore,
} from "./widget-conversation-effects.js";

export const useWidgetChat = ({
  client,
  conversationStorageKey,
  hostBridge,
  selectedProfileId,
}: {
  readonly client: ChatClient;
  readonly conversationStorageKey: string | undefined;
  readonly hostBridge: Pick<HostBridge, "getContext" | "dispatchCommand"> | undefined;
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
  const [conversations, setConversations] = useState<readonly WidgetConversationSummary[]>(
    initialConversationStore.current.conversations,
  );
  // True while a conversation hydrates so the skeleton shows (not the empty greeting).
  const [isLoadingHistory, setIsLoadingHistory] = useState(
    () => initialConversationStore.current.activeConversationId !== undefined,
  );
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const pendingConversationTitleRef = useRef<string | undefined>(undefined);
  // Id a stream established; history must not refetch it (live messages already set).
  const streamOwnedConversationRef = useRef<string | undefined>(undefined);
  const loadConversations = useConversationList(
    client,
    setConversations,
    setErrorMessage,
    conversationId,
  );
  const applyStreamEvent = useWidgetStreamEventHandlers({
    hostBridge,
    loadConversations,
    pendingConversationTitleRef,
    setConversationId,
    setConversations,
    setErrorMessage,
    setMessages,
    setStatus,
    setUsage,
    streamOwnedConversationRef,
  });
  usePersistConversationStore(conversationStorageKey, conversationId, conversations);
  useConversationHistory(
    client,
    conversationId,
    streamOwnedConversationRef,
    setMessages,
    setErrorMessage,
    setIsLoadingHistory,
  );

  const submitMessage = useCallback(
    async (messageText: string) => {
      const trimmed = messageText.trim();
      if (!trimmed || status === "submitted" || status === "streaming") return;

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
          assistantProfileId: selectedProfileId,
          conversationId,
          hostContext,
          message: trimmed,
          messageId: userMessageId,
          requestId,
        });

        const result = await client.streamChat(request, {
          signal: abortController.signal,
        });
        setStatus("streaming");

        for await (const event of result.events) {
          if (abortController.signal.aborted) break;
          await applyStreamEvent(event, assistantMessageId);
        }

        if (!isActiveRequest(abortControllerRef, abortController)) return;
        pendingConversationTitleRef.current = undefined;
        setMessages(completeAssistantMessageFor(assistantMessageId));
        setStatus((current) => (current === "error" ? current : "idle"));
        void loadConversations().catch(reportError(setErrorMessage));
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
      hostBridge,
      loadConversations,
      selectedProfileId,
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
    setIsLoadingHistory(nextConversationId !== undefined);
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
    messages,
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

type SetWidgetError = Dispatch<SetStateAction<string | undefined>>;
type SetWidgetConversationId = Dispatch<SetStateAction<string | undefined>>;
type SetWidgetConversations = Dispatch<SetStateAction<readonly WidgetConversationSummary[]>>;
type SetWidgetStatus = Dispatch<SetStateAction<WidgetStatus>>;
type SetWidgetUsage = Dispatch<SetStateAction<WidgetUsage | undefined>>;
type ActiveRequestRef = { readonly current: AbortController | undefined };
type PendingConversationTitleRef = { readonly current: string | undefined };
type MutableConversationRef = { current: string | undefined };
type LoadConversations = (signal?: AbortSignal) => Promise<void>;

const useWidgetStreamEventHandlers = ({
  hostBridge,
  loadConversations,
  pendingConversationTitleRef,
  setConversationId,
  setConversations,
  setErrorMessage,
  setMessages,
  setStatus,
  setUsage,
  streamOwnedConversationRef,
}: {
  readonly hostBridge: Pick<HostBridge, "dispatchCommand"> | undefined;
  readonly loadConversations: LoadConversations;
  readonly pendingConversationTitleRef: PendingConversationTitleRef;
  readonly setConversationId: SetWidgetConversationId;
  readonly setConversations: SetWidgetConversations;
  readonly setErrorMessage: SetWidgetError;
  readonly setMessages: Dispatch<SetStateAction<WidgetMessage[]>>;
  readonly setStatus: SetWidgetStatus;
  readonly setUsage: SetWidgetUsage;
  readonly streamOwnedConversationRef: MutableConversationRef;
}) => {
  const refreshConversationsAfterCompletion = useCallback(() => {
    void loadConversations().catch(reportError(setErrorMessage));
  }, [loadConversations, setErrorMessage]);
  const recordStartedConversation = useCallback(
    (startedConversationId: string, createdAt: string) => {
      // Mark stream-owned before adopting the id so history skips it (no clobber).
      streamOwnedConversationRef.current = startedConversationId;
      setConversationId(startedConversationId);
      const fallbackTitle = pendingConversationTitleRef.current;
      if (!fallbackTitle) return;
      setConversations((current) =>
        upsertStartedConversationSummary(current, {
          conversationId: startedConversationId,
          fallbackTitle,
          lastMessageAt: createdAt,
        }),
      );
    },
    [pendingConversationTitleRef, setConversationId, setConversations, streamOwnedConversationRef],
  );

  return useWidgetStreamEvents(
    {
      onConversationStarted: recordStartedConversation,
      onStreamCompleted: () => {
        setStatus("idle");
        refreshConversationsAfterCompletion();
      },
      setErrorMessage,
      setMessages,
      setStatus,
      setUsage,
    },
    hostBridge,
  );
};

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

const reportError =
  (setErrorMessage: SetWidgetError) =>
  (error: unknown): void => {
    setErrorMessage(toErrorMessage(error));
  };

const isActiveRequest = (requestRef: ActiveRequestRef, abortController: AbortController): boolean =>
  requestRef.current === abortController;

const clearErrorStatus = (status: WidgetStatus): WidgetStatus =>
  status === "error" ? "idle" : status;
