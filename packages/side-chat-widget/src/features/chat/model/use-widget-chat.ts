import type { ChatModelPreference } from "@side-chat/chat-protocol";
import type { WidgetHostBridge } from "@side-chat/host-bridge";
import { useMemo, useRef, useState, type MutableRefObject } from "react";

import { runStatusToWidgetStatus } from "./run/widget-run-state.js";
import {
  readWidgetConversationStore,
  useConversationQueryRepository,
  useGetConversationHistory,
  useGetConversations,
  type RefreshConversations,
  type RefreshHistory,
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

/**
 * Reconcile persisted selection, server resources, and one live run into the
 * view model consumed by the widget shell.
 *
 * Server history is authoritative between turns. During a turn, the run store
 * temporarily owns the visible transcript so a refetch cannot erase streamed
 * text; the shell bridge records that ownership until terminal effects refresh
 * history and hand the committed transcript back to the query cache.
 */
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
  const hostCommandBridge = useMemo(
    () =>
      hostBridge?.dispatchCommand ? { dispatchCommand: hostBridge.dispatchCommand } : undefined,
    [hostBridge],
  );

  const controller = useWidgetRunController({
    client,
    hostBridge: hostCommandBridge,
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

  usePersistConversationStore({
    conversationId,
    conversationStorageKey,
    conversations,
  });
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
  const runningConversationIds = useRunningConversationActivity({
    client,
    conversationId,
    refreshConversations,
    refreshHistory,
    streamOwnedConversationId: shellSnapshot.streamOwnedConversationId,
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

type RunningConversationActivityInput = {
  readonly client: Pick<SideChatApiClient, "subscribeActivity">;
  readonly conversationId: string | undefined;
  readonly refreshConversations: RefreshConversations;
  readonly refreshHistory: RefreshHistory;
  readonly streamOwnedConversationId: string | undefined;
};

/** Track live turns across conversations and close cache gaps after reconnects. */
const useRunningConversationActivity = ({
  client,
  conversationId,
  refreshConversations,
  refreshHistory,
  streamOwnedConversationId,
}: RunningConversationActivityInput): ReadonlySet<string> => {
  const hasConnectedRef = useRef(false);

  return useActivityStream({
    client,
    // The conversation query performs the initial list read. Later connects may
    // have missed lifecycle events, so they refresh the list before showing dots.
    onConnected: () => {
      if (!hasConnectedRef.current) {
        hasConnectedRef.current = true;
        return;
      }
      void refreshConversations();
    },
    // Another tab can start a turn for the conversation shown here. Pull history
    // so its active turn is resumed, unless this tab's stream already owns it.
    onEvent: (event) => {
      if (event.conversationId !== conversationId) return;
      if (streamOwnedConversationId === conversationId) return;
      void refreshHistory(conversationId);
    },
  });
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
