import type { ChatModelPreference } from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";
import { useMemo, useRef, useState, type MutableRefObject } from "react";

import { runStatusToWidgetStatus } from "./run/widget-run-state.js";
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
import { useReconnectTriggers } from "./reconnect/widget-reconnect-triggers.js";
import { useWidgetRunController } from "./reconnect/widget-run-controller.js";
import { useWidgetChatActions } from "./use-widget-chat-actions.js";
import { useWidgetRunEffects } from "./use-widget-run-effects.js";

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
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationStore.current.activeConversationId,
  );
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const pendingConversationTitleRef = useRef<string | undefined>(undefined);
  // Id established by the current run. History must not refetch it because the
  // live run already owns those messages until the user reselects it.
  const streamOwnedConversationRef = useRef<string | undefined>(undefined);

  const conversationsQuery = useGetConversations({
    activeConversationId: conversationId,
    client,
    initialConversations: initialConversationStore.current.conversations,
  });
  const { refreshConversations, upsertStartedConversation, refreshHistory } =
    useConversationQueryRepository({
      activeConversationId: conversationId,
      client,
      initialConversations: initialConversationStore.current.conversations,
    });

  const controller = useWidgetRunController({
    client,
    hostBridge,
    storeKey: { storageKey: conversationStorageKey, baseUrl: undefined },
    conversationStorageKey,
    onReplayExpired: useReplayExpiredHandler(streamOwnedConversationRef, setConversationId),
    refreshHistory,
  });
  const run = controller.run;
  const runVisible = run !== undefined && isRunVisibleFor(run.conversationId, conversationId);

  const shouldLoadHistory =
    conversationId !== undefined &&
    client.readHistory !== undefined &&
    conversationId !== streamOwnedConversationRef.current;
  const historyQuery = useGetConversationHistory({
    client,
    conversationId,
    enabled: shouldLoadHistory,
  });
  const historyMessages = useConversationHistoryMessages({
    conversationId,
    history: historyQuery.data,
    shouldLoadHistory,
  });

  const visibleRun = runVisible ? run : undefined;
  const conversations = conversationsQuery.data ?? [];
  const status = visibleRun ? runStatusToWidgetStatus(visibleRun.status) : "idle";
  const visibleMessages = useMemo(
    () => (visibleRun ? visibleRun.messages : (historyMessages ?? [])),
    [historyMessages, visibleRun],
  );
  const isLoadingHistory = shouldLoadHistory && historyQuery.isPending && !historyQuery.data;
  const liveErrorMessage = visibleRun?.errorMessage ?? errorMessage;
  // Latest transcript, so a new turn seeds its run with the prior messages: the
  // run store holds only the current run, so multi-turn history is carried in.
  const visibleMessagesRef = useLatestRef(visibleMessages);

  usePersistConversationStore({ conversationId, conversationStorageKey, conversations });
  useConversationQueryErrors({
    conversationsError: conversationsQuery.error,
    historyError: historyQuery.error,
    setErrorMessage,
    shouldLoadHistory,
  });
  useWidgetRunEffects({
    run,
    setConversationId,
    setErrorMessage,
    streamOwnedConversationRef,
    pendingConversationTitleRef,
    refreshConversations,
    upsertStartedConversation,
  });
  useReconnectTriggers(controller.reconnect);

  const actions = useWidgetChatActions({
    controller,
    hostBridge,
    conversationId,
    selectedProfileId,
    selectedModel,
    status,
    visibleMessages,
    visibleMessagesRef,
    setConversationId,
    setErrorMessage,
    streamOwnedConversationRef,
    pendingConversationTitleRef,
  });

  return {
    clearError: actions.clearError,
    conversationId,
    conversations,
    errorMessage: liveErrorMessage,
    isLoadingHistory,
    messages: visibleMessages,
    retryLastMessage: actions.retryLastMessage,
    selectConversation: actions.selectConversation,
    setErrorMessage,
    status,
    startNewConversation: actions.startNewConversation,
    stop: actions.stop,
    submitMessage: actions.submitMessage,
    usage: visibleRun?.usage,
  };
};

// A run's messages belong to the displayed conversation when their ids match, or
// when the run has not yet been assigned a conversation (it was just started in
// the current view). One active run per instance keeps this unambiguous.
const isRunVisibleFor = (
  runConversationId: string | undefined,
  selectedConversationId: string | undefined,
): boolean => runConversationId === undefined || runConversationId === selectedConversationId;

// On replay_expired the durable log is gone: drop the live-run guard so history
// reloads, and adopt the conversation id so the right transcript is shown.
const useReplayExpiredHandler = (
  streamOwnedConversationRef: { current: string | undefined },
  setConversationId: (conversationId: string | undefined) => void,
): ((conversationId: string | undefined) => void) =>
  useMemo(
    () => (conversationId: string | undefined) => {
      streamOwnedConversationRef.current = undefined;
      if (conversationId) setConversationId(conversationId);
    },
    [setConversationId, streamOwnedConversationRef],
  );

// Keep the latest value in a ref so a callback can read it without re-creating
// (and so a turn seeds from the freshest transcript without a stale closure).
const useLatestRef = <T>(value: T): MutableRefObject<T> => {
  const ref = useRef(value);
  ref.current = value;
  return ref;
};
