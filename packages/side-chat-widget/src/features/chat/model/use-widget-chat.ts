import type { ChatModelPreference } from "@side-chat/chat-protocol";
import type { WidgetHostBridge } from "@side-chat/host-bridge";
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
  useResumeActiveTurn,
} from "./conversation/widget-conversation-query-effects.js";
import { useActivityStream } from "./activity/use-activity-stream.js";
import { useReconnectTriggers } from "./reconnect/widget-reconnect-triggers.js";
import { useWidgetRunController } from "./reconnect/widget-run-controller.js";
import {
  createRunShellBridge,
  useRunShellSnapshot,
  type RunShellBridge,
} from "./conversation/shell/run-shell-bridge.js";
import { useWidgetChatActions } from "./use-widget-chat-actions.js";
import { useWidgetRunEffects } from "./use-widget-run-effects.js";
import {
  isRunVisibleFor,
  runOwnsHistory,
  toRunNotice,
  useVisibleMessagesWithCarriedActivity,
} from "./view/widget-visible-transcript.js";

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
  // One reactive bridge publishes the run state the conversation shell needs;
  // lazy state keeps that bridge instance stable for the lifetime of the mount.
  const [shellBridge] = useState(createRunShellBridge);
  const shellSnapshot = useRunShellSnapshot(shellBridge);

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
    onReplayExpired: useReplayExpiredHandler(shellBridge, setConversationId),
    refreshHistory,
  });
  const run = controller.run;
  const runVisible = run !== undefined && isRunVisibleFor(run.conversationId, conversationId);

  const shouldLoadHistory =
    conversationId !== undefined &&
    client.readHistory !== undefined &&
    !runOwnsHistory(run, conversationId, shellSnapshot.streamOwnedConversationId);
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
  const visibleMessages = useVisibleMessagesWithCarriedActivity(
    visibleRun,
    historyMessages,
    conversationId,
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
    shellBridge,
    refreshConversations,
    upsertStartedConversation,
    refreshHistory,
    getRun: controller.getRun,
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
  // each RE-connect so a chat started elsewhere appears with its dot.
  const activityConnectedRef = useRef(false);
  const runningConversationIds = useActivityStream({
    client,
    // The initial list load is the conversations query's job; the activity stream only
    // needs to close a gap on a reconnect, so skip the first connect to avoid a
    // duplicate list read on mount.
    onConnected: () => {
      if (!activityConnectedRef.current) {
        activityConnectedRef.current = true;
        return;
      }
      void refreshConversations();
    },
    // A turn started in another tab for the conversation this tab is viewing: pull the
    // server transcript so the history read's `activeTurn` resumes here. Skip while a
    // local run owns this conversation for the whole turn (adopt→handoff): the
    // run→history handoff already re-reads history on terminal, so refetching here
    // would only duplicate that read.
    onEvent: (event) => {
      if (event.conversationId !== conversationId) return;
      if (shellSnapshot.streamOwnedConversationId === conversationId) return;
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
    shellBridge,
  });

  return {
    clearError: actions.clearError,
    conversationId,
    conversations,
    notice,
    isLoadingHistory,
    messages: visibleMessages,
    // Manual catch-up: re-read the current conversation from the server (the
    // header Refresh button), independent of owner-bound live recovery.
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

// On replay_expired the stream buffer is gone: drop the live-run guard so history
// reloads, and adopt the conversation id so the right transcript is shown.
const useReplayExpiredHandler = (
  shellBridge: RunShellBridge,
  setConversationId: (conversationId: string | undefined) => void,
): ((conversationId: string | undefined) => void) =>
  useMemo(
    () => (conversationId: string | undefined) => {
      shellBridge.releaseStreamOwnership();
      if (conversationId) setConversationId(conversationId);
    },
    [setConversationId, shellBridge],
  );

// Keep the latest value in a ref so a callback can read it without re-creating
// (and so a turn seeds from the freshest transcript without a stale closure).
const useLatestRef = <T>(value: T): MutableRefObject<T> => {
  const ref = useRef(value);
  ref.current = value;
  return ref;
};
