import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

import type { WorkflowConversationSummary } from "#entities/workflow-chat";
import type { ConversationSummaryView } from "#features/conversation";
import { useSendPreference, useToolDetailPreference } from "#features/settings";
import type {
  WorkflowModelSelection,
  WorkflowWidgetChatSessionRegistry,
} from "#features/workflow-chat";
import type { useWidgetAppearance, useWidgetTheme } from "#features/theme";
import type { resolveWidgetLabels } from "#shared/lib/widget-labels";

import type { WorkflowSideChatWidgetProps } from "../../../model/side-chat-widget.types.js";
import { useWorkflowConversationActivity } from "../../../model/queries/use-workflow-conversation-activity.js";
import { useWorkflowConversationQueries } from "../../../model/queries/use-workflow-conversation-queries.js";
import { useWorkflowPanelRefresh } from "../../../model/refresh/use-workflow-panel-refresh.js";
import { isWorkflowConversationTitleFallback } from "../../../model/refresh/workflow-conversation-title-refresh.js";
import type { WorkflowHostContextSelection } from "../../../model/selection/side-chat-host-context-selection.js";
import type { WidgetToolSelection } from "../../../model/selection/side-chat-tool-selection.js";
import { resolveWorkflowRecoveryValidation } from "../../../model/selection/workflow-recovery/workflow-recovery-validation.js";
import { useWorkflowConversationSelection } from "../../../model/selection/workflow/use-workflow-conversation-selection.js";
import { SideChatPanelView } from "../../panel/side-chat-panel-view.js";
import { WorkflowChatSession } from "../workflow-chat-session.js";
import { selectWorkflowHistoryContent } from "../workflow-history-content.js";

const NO_RUNNING_CONVERSATIONS: ReadonlySet<string> = new Set();

type WorkflowConversationPanelProps = Readonly<{
  appearance: ReturnType<typeof useWidgetAppearance>;
  hostBridge: WorkflowSideChatWidgetProps["hostBridge"];
  hostContextSelection: WorkflowHostContextSelection;
  initialConversationId: WorkflowSideChatWidgetProps["initialConversationId"];
  labels: ReturnType<typeof resolveWidgetLabels>;
  onClose: () => void;
  quickActions: NonNullable<WorkflowSideChatWidgetProps["quickActions"]>;
  renderActivityItem: WorkflowSideChatWidgetProps["renderActivityItem"];
  renderAgentMark: WorkflowSideChatWidgetProps["renderAgentMark"];
  theme: ReturnType<typeof useWidgetTheme>;
  workflowChat: WorkflowSideChatWidgetProps["workflowChat"];
  workflowActiveTurnStorageKey: WorkflowSideChatWidgetProps["workflowActiveTurnStorageKey"];
  workflowConversationSelectionStorageKey: WorkflowSideChatWidgetProps["workflowConversationSelectionStorageKey"];
  modelSelection: WorkflowModelSelection;
  sessionRegistry: WorkflowWidgetChatSessionRegistry;
  toolSelection: WidgetToolSelection;
}>;

/** Own the selected conversation and seed one keyed native chat session. */
export function WorkflowConversationPanel({
  appearance,
  hostBridge,
  hostContextSelection,
  initialConversationId,
  labels,
  onClose,
  quickActions,
  renderActivityItem,
  renderAgentMark,
  theme,
  workflowChat,
  workflowActiveTurnStorageKey,
  workflowConversationSelectionStorageKey,
  modelSelection,
  sessionRegistry,
  toolSelection,
}: WorkflowConversationPanelProps): ReactNode {
  const queryClient = useQueryClient();
  const sendPreference = useSendPreference();
  const toolDetailPreference = useToolDetailPreference();
  const {
    activeConversationId,
    acceptedRun,
    clearTerminalRun,
    discardInvalidRecovery,
    focusActiveRun,
    isLocalDraft,
    recoveryCursor,
    recoveryNeedsValidation,
    selectConversation,
    startNewConversation,
  } = useWorkflowConversationSelection(
    initialConversationId,
    workflowActiveTurnStorageKey,
    workflowConversationSelectionStorageKey,
  );
  const {
    applyActivityEvent,
    catalog,
    conversationClient,
    state,
    refreshConversation,
    refreshConversationCatalog,
    refreshConversationTitle,
  } = useWorkflowConversationQueries(queryClient, workflowChat, activeConversationId, isLocalDraft);
  const titleRefreshCandidates = useRef(new Set<string>());
  useWorkflowConversationActivity({
    activeConversationId,
    applyActivityEvent,
    isLocalDraft,
    refreshConversation,
    refreshConversationCatalog,
    sessionRegistry,
    workflowChat,
  });
  const titleIsFallback = isWorkflowConversationTitleFallback(
    catalog.data,
    activeConversationId,
    state.data?.snapshot.messages,
  );
  const recovery = resolveWorkflowRecoveryValidation({
    activeConversationId,
    activeTurn: state.data?.snapshot.activeTurn ?? null,
    cursor: recoveryCursor,
    discoveryFailed: state.isError,
    discoverySettled: state.isSuccess,
    needsValidation: recoveryNeedsValidation,
  });
  const clientToolCapability = recovery.clientToolCapability;
  useWorkflowRecoverySynchronization({
    activeConversationId,
    discardInvalidRecovery,
    focusActiveRun,
    recovery,
    clientToolCapability,
  });
  const handleRunAccepted = useCallback(
    (runId: string, clientToolCapability: string): void => {
      rememberTitleRefreshCandidate(
        titleRefreshCandidates.current,
        activeConversationId,
        isLocalDraft,
        titleIsFallback,
      );
      acceptedRun(activeConversationId, runId, clientToolCapability);
      refreshConversationCatalog();
    },
    [acceptedRun, activeConversationId, isLocalDraft, refreshConversationCatalog, titleIsFallback],
  );
  const handleRunTerminal = useCallback(
    (_runId: string): void => {
      reconcileAfterTerminal({
        conversationId: activeConversationId,
        refreshCandidates: titleRefreshCandidates.current,
        refreshConversation,
        refreshConversationCatalog,
        refreshConversationTitle,
        titleIsFallback,
      });
    },
    [
      activeConversationId,
      refreshConversation,
      refreshConversationCatalog,
      refreshConversationTitle,
      titleIsFallback,
    ],
  );
  const handleRunReconciled = useCallback(
    (runId: string): void => {
      clearTerminalRun(runId);
    },
    [clearTerminalRun],
  );
  const { refresh } = useWorkflowPanelRefresh(queryClient);
  const refreshPanel = useCallback((): void => {
    refresh();
  }, [refresh]);
  const conversationViews = toConversationViews(
    catalog.data?.conversations,
    labels.conversationNewChat,
  );
  const runningConversationIds = catalog.data?.runningConversationIds ?? NO_RUNNING_CONVERSATIONS;
  const historyContent = selectWorkflowHistoryContent({
    error: state.error,
    hasMountedSession: sessionRegistry.has(activeConversationId),
    hasSnapshot: state.data !== undefined,
    isLocalDraft,
    isPending: state.isPending,
    isRecoveryPending: recovery.isPending,
    labels,
    onRetry: () => {
      void state.refetch();
    },
    session: (
      <WorkflowChatSession
        activeTurn={isLocalDraft ? undefined : recovery.activeTurn}
        clientToolCapability={clientToolCapability}
        hostBridge={hostBridge}
        hostContextSelection={hostContextSelection}
        initialMessages={isLocalDraft ? [] : (state.data?.snapshot.messages ?? [])}
        labels={labels}
        onRunAccepted={handleRunAccepted}
        onRunReconciled={handleRunReconciled}
        onRunTerminal={handleRunTerminal}
        quickActions={quickActions}
        renderActivityItem={renderActivityItem}
        renderAgentMark={renderAgentMark}
        sendOnEnter={!sendPreference.sendWithCtrlEnter}
        toolDetail={toolDetailPreference.toolDetail}
        workflowChat={conversationClient}
        modelSelection={modelSelection}
        sessionRegistry={sessionRegistry}
        stateObservationId={state.data?.observationId}
        toolSelection={toolSelection}
      />
    ),
  });
  return (
    <SideChatPanelView
      appearance={appearance}
      content={historyContent}
      conversations={conversationViews}
      labels={labels}
      onClose={onClose}
      onNewConversation={startNewConversation}
      onRefresh={refreshPanel}
      onSelectConversation={selectConversation}
      renderAgentMark={renderAgentMark}
      runningConversationIds={runningConversationIds}
      selectedConversationId={activeConversationId}
      sendPreference={sendPreference}
      theme={theme}
      toolDetailPreference={toolDetailPreference}
    />
  );
}

function useWorkflowRecoverySynchronization({
  activeConversationId,
  clientToolCapability,
  discardInvalidRecovery,
  focusActiveRun,
  recovery,
}: {
  readonly activeConversationId: string;
  readonly clientToolCapability: string | undefined;
  readonly discardInvalidRecovery: ReturnType<
    typeof useWorkflowConversationSelection
  >["discardInvalidRecovery"];
  readonly focusActiveRun: ReturnType<typeof useWorkflowConversationSelection>["focusActiveRun"];
  readonly recovery: ReturnType<typeof resolveWorkflowRecoveryValidation>;
}): void {
  useEffect(() => {
    if (recovery.invalidCursor) discardInvalidRecovery(recovery.invalidCursor);
  }, [discardInvalidRecovery, recovery.invalidCursor]);
  useEffect(() => {
    if (recovery.activeTurn) {
      focusActiveRun(activeConversationId, recovery.activeTurn.runId, clientToolCapability);
    }
  }, [activeConversationId, clientToolCapability, focusActiveRun, recovery.activeTurn]);
}

function toConversationViews(
  conversations: readonly WorkflowConversationSummary[] | undefined,
  newChatLabel: string,
): readonly ConversationSummaryView[] {
  return (conversations ?? []).map((conversation) => ({
    id: conversation.id,
    title: conversation.title || newChatLabel,
    lastMessageAt: conversation.lastMessageAt,
  }));
}

function rememberTitleRefreshCandidate(
  candidates: Set<string>,
  conversationId: string,
  isLocalDraft: boolean,
  titleIsFallback: boolean,
): void {
  if (isLocalDraft || titleIsFallback) candidates.add(conversationId);
}

function reconcileAfterTerminal({
  conversationId,
  refreshCandidates,
  refreshConversation,
  refreshConversationCatalog,
  refreshConversationTitle,
  titleIsFallback,
}: Readonly<{
  conversationId: string;
  refreshCandidates: Set<string>;
  refreshConversation: (conversationId: string) => void;
  refreshConversationCatalog: () => void;
  refreshConversationTitle: (conversationId: string) => Promise<boolean>;
  titleIsFallback: boolean;
}>): void {
  refreshConversation(conversationId);
  if (!refreshCandidates.has(conversationId) && !titleIsFallback) {
    refreshConversationCatalog();
    return;
  }
  void refreshConversationTitle(conversationId).then((updated) => {
    if (updated) refreshCandidates.delete(conversationId);
  });
}
