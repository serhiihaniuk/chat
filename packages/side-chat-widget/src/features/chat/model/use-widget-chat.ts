import type { ChatModelPreference } from "@side-chat/chat-protocol";
import type { WidgetHostBridge } from "@side-chat/host-bridge";
import { useMemo, useRef, useState, type MutableRefObject } from "react";

import type { WidgetRunNotice } from "#entities/chat";
import {
  WIDGET_RUN_STATUSES,
  isTerminalRunStatus,
  runStatusToWidgetStatus,
  type WidgetRunState,
} from "./run/widget-run-state.js";
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
  useResumeActiveTurn,
} from "./conversation/widget-conversation-query-effects.js";
import { useActivityStream } from "./activity/use-activity-stream.js";
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
  enabledToolNames,
}: {
  readonly client: SideChatApiClient;
  readonly conversationStorageKey: string | undefined;
  readonly hostBridge: WidgetHostBridge | undefined;
  readonly selectedModel: ChatModelPreference | undefined;
  readonly selectedProfileId: string | undefined;
  readonly enabledToolNames: readonly string[] | undefined;
}) => {
  // Lazy initializer so the localStorage read + JSON.parse runs once on mount,
  // not on every render (a bare `useRef(read())` re-evaluates its argument each
  // render even though the ref keeps the first value).
  const [initialConversationStore] = useState(() =>
    readWidgetConversationStore(conversationStorageKey),
  );
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationStore.activeConversationId,
  );
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const pendingConversationTitleRef = useRef<string | undefined>(undefined);
  // Id established by the current run. History must not refetch it because the
  // live run already owns those messages until the user reselects it.
  const streamOwnedConversationRef = useRef<string | undefined>(undefined);

  const conversationsQuery = useGetConversations({
    activeConversationId: conversationId,
    client,
    initialConversations: initialConversationStore.conversations,
  });
  const { refreshConversations, upsertStartedConversation, refreshHistory } =
    useConversationQueryRepository({
      activeConversationId: conversationId,
      client,
      initialConversations: initialConversationStore.conversations,
    });

  const controller = useWidgetRunController({
    client,
    hostBridge,
    // Namespace the run store + subscription slot by storage key AND service, so
    // two widgets pointed at different services never share a live run.
    storeKey: { storageKey: conversationStorageKey, baseUrl: client.baseUrl },
    conversationStorageKey,
    onReplayExpired: useReplayExpiredHandler(streamOwnedConversationRef, setConversationId),
    refreshHistory,
  });
  const run = controller.run;
  const runVisible = run !== undefined && isRunVisibleFor(run.conversationId, conversationId);

  const shouldLoadHistory =
    conversationId !== undefined &&
    client.readHistory !== undefined &&
    !runOwnsHistory(run, conversationId, streamOwnedConversationRef.current);
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
  const notice = toRunNotice(visibleRun, liveErrorMessage);
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
    refreshHistory,
    clearRun: controller.clearRun,
  });
  useReconnectTriggers(controller.reconnect);
  // The server reports an in-flight turn on the history read; resume it even when
  // no local marker exists (fresh device, cleared storage, or a stale marker).
  useResumeActiveTurn({
    history: historyQuery.data,
    historyMessages,
    resumeActiveTurn: controller.resumeFromHistory,
  });
  // Live turn lifecycle for every conversation, so the sidebar shows a "generating"
  // dot on chats with an in-flight turn — even ones not open. Refresh the list on
  // each (re)connect so a chat started elsewhere appears with its dot.
  const runningConversationIds = useActivityStream({
    client,
    onConnected: () => void refreshConversations(),
    // A turn started in another tab for the conversation this tab is viewing: pull
    // the server transcript so the history read's `activeTurn` resumes the live
    // stream here (running) or shows the final messages (terminal). Skip only
    // while a local NON-terminal run owns this conversation — once the local run
    // is terminal, the other tab's turn must show up here.
    onEvent: (event) => {
      if (event.conversationId !== conversationId) return;
      if (run?.conversationId === conversationId && !isTerminalRunStatus(run.status)) return;
      void refreshHistory(conversationId);
    },
  });

  const actions = useWidgetChatActions({
    controller,
    hostBridge,
    conversationId,
    selectedProfileId,
    selectedModel,
    enabledToolNames,
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
    notice,
    isLoadingHistory,
    messages: visibleMessages,
    // Manual catch-up: re-read the current conversation from the server (the header
    // Refresh button), now that connection-bound streaming has no auto-resume.
    refresh: () => {
      void refreshHistory(conversationId);
    },
    retryLastMessage: actions.retryLastMessage,
    runningConversationIds,
    selectConversation: actions.selectConversation,
    setErrorMessage,
    status,
    startNewConversation: actions.startNewConversation,
    stop: actions.stop,
    submitMessage: actions.submitMessage,
    usage: visibleRun?.usage,
  };
};

// Turn the run + message into the notice the conversation view renders: a blocked
// turn gets the calm guard notice, any other message is the retryable error
// surface, and a clean or cancelled run shows nothing.
const toRunNotice = (
  run: WidgetRunState | undefined,
  message: string | undefined,
): WidgetRunNotice | undefined => {
  if (!message) return undefined;
  return run?.status === WIDGET_RUN_STATUSES.BLOCKED
    ? { kind: "blocked", message }
    : { kind: "error", message };
};

// A run owns its conversation's transcript only while it is NON-terminal: the
// moment it ends, history loading resumes so the run→history handoff (and the
// header Refresh button) can read the committed answer from the server.
const runOwnsHistory = (
  run: WidgetRunState | undefined,
  conversationId: string,
  streamOwnedConversationId: string | undefined,
): boolean =>
  run !== undefined &&
  !isTerminalRunStatus(run.status) &&
  conversationId === streamOwnedConversationId;

// A run's messages belong to the displayed conversation when their ids match, or
// when the run has not yet been assigned a conversation (it was just started in
// the current view). One active run per instance keeps this unambiguous.
const isRunVisibleFor = (
  runConversationId: string | undefined,
  selectedConversationId: string | undefined,
): boolean => runConversationId === undefined || runConversationId === selectedConversationId;

// On replay_expired the stream buffer is gone: drop the live-run guard so history
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
