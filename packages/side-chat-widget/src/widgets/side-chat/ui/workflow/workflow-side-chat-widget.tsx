import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { DEFAULT_REASONING_VISIBILITY } from "#entities/settings";
import type { WorkflowConversationSummary } from "#entities/workflow-chat";
import type { ConversationSummaryView } from "#features/conversation";
import { ClosedWidgetLauncher, ResizablePanel, useWidgetPanelSize } from "#features/panel";
import { useSendPreference, useToolDetailPreference } from "#features/settings";
import {
  useWorkflowModelSelection,
  type WorkflowModelSelection,
  type WorkflowWidgetChatStatus,
  WORKFLOW_WIDGET_CHAT_STATUS,
} from "#features/workflow-chat";
import { useWidgetAppearance, useWidgetTheme } from "#features/theme";
import { resolveWidgetLabels, WidgetLabelsProvider } from "#shared/lib/widget-labels";
import { SideChatWidgetRoot } from "#shared/ui/widget-root";

import type { WorkflowSideChatWidgetProps } from "../../model/side-chat-widget.types.js";
import { useWorkflowConversationQueries } from "../../model/queries/use-workflow-conversation-queries.js";
import {
  useWorkflowHostContextSelection,
  type WorkflowHostContextSelection,
} from "../../model/selection/side-chat-host-context-selection.js";
import {
  useWorkflowToolSelection,
  type WidgetToolSelection,
} from "../../model/selection/side-chat-tool-selection.js";
import { useWorkflowPanelRefresh } from "../../model/refresh/use-workflow-panel-refresh.js";
import { useWorkflowConversationSelection } from "../../model/selection/workflow/use-workflow-conversation-selection.js";
import { resolveWorkflowRecoveryValidation } from "../../model/selection/workflow-recovery/workflow-recovery-validation.js";
import { SideChatPanelView } from "../panel/side-chat-panel-view.js";
import { WorkflowChatSession } from "./workflow-chat-session.js";
import { selectWorkflowHistoryContent } from "./workflow-history-content.js";

const NO_RUNNING_CONVERSATIONS: ReadonlySet<string> = new Set();
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
/** Render a workspace's conversations through the native workflow transport. */
export function WorkflowSideChatWidget({
  defaultOpen = true,
  defaultPanelSize,
  defaultTheme,
  labels: labelsProp,
  hostBridge,
  initialConversationId,
  onOpenChange,
  open,
  panelActions,
  panelSizeStorageKey,
  quickActions = [],
  reasoningVisibility = DEFAULT_REASONING_VISIBILITY,
  renderActivityItem,
  renderAgentMark,
  renderClosedLauncher = true,
  themeStorageKey,
  workflowChat,
  workflowActiveTurnStorageKey,
}: WorkflowSideChatWidgetProps) {
  const labels = useMemo(() => resolveWidgetLabels(labelsProp), [labelsProp]);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;
  const { panelSize, setPanelSize } = useWidgetPanelSize({
    defaultPanelSize,
    storageKey: panelSizeStorageKey,
  });
  const theme = useWidgetTheme({ defaultTheme, storageKey: themeStorageKey });
  const appearance = useWidgetAppearance();
  const modelSelection = useWorkflowModelSelection(workflowChat);
  const hostContextSelection = useWorkflowHostContextSelection(workflowChat, hostBridge);
  const toolSelection = useWorkflowToolSelection(workflowChat);
  const requestOpenChange = (nextOpen: boolean): void => {
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  if (!isOpen && renderClosedLauncher) {
    return (
      <SideChatWidgetRoot
        data-sidechat-accent={appearance.appearanceRootProps["data-sidechat-accent"]}
        style={appearance.appearanceRootProps.style}
        theme={theme.themeId}
      >
        <ClosedWidgetLauncher label={labels.title} onOpen={() => requestOpenChange(true)} />
      </SideChatWidgetRoot>
    );
  }
  if (!isOpen) return null;
  return (
    <WidgetLabelsProvider value={labels}>
      <ResizablePanel
        anchor="fixed"
        aria-label={labels.title}
        data-sidechat-accent={appearance.appearanceRootProps["data-sidechat-accent"]}
        defaultSize={panelSize}
        onSizeChange={setPanelSize}
        role="region"
        style={appearance.appearanceRootProps.style}
        theme={theme.themeId}
      >
        <WorkflowConversationPanel
          appearance={appearance}
          hostBridge={hostBridge}
          hostContextSelection={hostContextSelection}
          labels={labels}
          initialConversationId={initialConversationId}
          onClose={() => {
            panelActions?.onClose?.();
            requestOpenChange(false);
          }}
          quickActions={quickActions}
          reasoningVisibility={reasoningVisibility}
          renderActivityItem={renderActivityItem}
          renderAgentMark={renderAgentMark}
          theme={theme}
          workflowChat={workflowChat}
          workflowActiveTurnStorageKey={workflowActiveTurnStorageKey}
          modelSelection={modelSelection}
          toolSelection={toolSelection}
        />
      </ResizablePanel>
    </WidgetLabelsProvider>
  );
}

/** Own the selected conversation and seed one keyed native chat session. */
function WorkflowConversationPanel({
  appearance,
  hostBridge,
  hostContextSelection,
  initialConversationId,
  labels,
  onClose,
  quickActions,
  reasoningVisibility,
  renderActivityItem,
  renderAgentMark,
  theme,
  workflowChat,
  workflowActiveTurnStorageKey,
  modelSelection,
  toolSelection,
}: {
  readonly appearance: ReturnType<typeof useWidgetAppearance>;
  readonly hostBridge: WorkflowSideChatWidgetProps["hostBridge"];
  readonly hostContextSelection: WorkflowHostContextSelection;
  readonly initialConversationId: WorkflowSideChatWidgetProps["initialConversationId"];
  readonly labels: ReturnType<typeof resolveWidgetLabels>;
  readonly onClose: () => void;
  readonly quickActions: NonNullable<WorkflowSideChatWidgetProps["quickActions"]>;
  readonly reasoningVisibility: WorkflowSideChatWidgetProps["reasoningVisibility"];
  readonly renderActivityItem: WorkflowSideChatWidgetProps["renderActivityItem"];
  readonly renderAgentMark: WorkflowSideChatWidgetProps["renderAgentMark"];
  readonly theme: ReturnType<typeof useWidgetTheme>;
  readonly workflowChat: WorkflowSideChatWidgetProps["workflowChat"];
  readonly workflowActiveTurnStorageKey: WorkflowSideChatWidgetProps["workflowActiveTurnStorageKey"];
  readonly modelSelection: WorkflowModelSelection;
  readonly toolSelection: WidgetToolSelection;
}): ReactNode {
  const queryClient = useQueryClient();
  const sendPreference = useSendPreference();
  const toolDetailPreference = useToolDetailPreference();
  const {
    activeConversationId,
    acceptedRun,
    clearTerminalRun,
    discardInvalidRecovery,
    isLocalDraft,
    recoveryCursor,
    recoveryNeedsValidation,
    selectConversation,
    startNewConversation,
  } = useWorkflowConversationSelection(initialConversationId, workflowActiveTurnStorageKey);
  const [sessionStatus, setSessionStatus] = useState<WorkflowWidgetChatStatus>(
    WORKFLOW_WIDGET_CHAT_STATUS.IDLE,
  );
  const [sessionOwnsConversation, setSessionOwnsConversation] = useState(false);
  const { catalog, conversationClient, discovery, history, refreshConversationCatalog } =
    useWorkflowConversationQueries(queryClient, workflowChat, activeConversationId, isLocalDraft);
  const recovery = resolveWorkflowRecoveryValidation({
    activeConversationId,
    activeTurn: discovery.data,
    cursor: recoveryCursor,
    discoveryFailed: discovery.isError,
    discoverySettled: discovery.isSuccess,
    needsValidation: recoveryNeedsValidation,
  });
  useEffect(() => {
    if (recovery.invalidCursor) discardInvalidRecovery(recovery.invalidCursor);
  }, [discardInvalidRecovery, recovery.invalidCursor]);
  const handleRunAccepted = useCallback(
    (runId: string): void => {
      setSessionOwnsConversation(true);
      acceptedRun(runId);
      refreshConversationCatalog();
    },
    [acceptedRun, refreshConversationCatalog],
  );
  const handleRunTerminal = useCallback(
    (runId: string): void => {
      clearTerminalRun(runId);
      refreshConversationCatalog();
    },
    [clearTerminalRun, refreshConversationCatalog],
  );
  const selectPersistedConversation = useCallback(
    (conversationId: string): void => {
      setSessionStatus(WORKFLOW_WIDGET_CHAT_STATUS.IDLE);
      setSessionOwnsConversation(false);
      selectConversation(conversationId);
    },
    [selectConversation],
  );
  const selectNewConversation = useCallback((): void => {
    setSessionStatus(WORKFLOW_WIDGET_CHAT_STATUS.IDLE);
    setSessionOwnsConversation(false);
    startNewConversation();
  }, [startNewConversation]);
  const { refresh, sessionRevision } = useWorkflowPanelRefresh(
    queryClient,
    activeConversationId,
    isLocalDraft,
  );
  const refreshPanel = useCallback((): void => {
    setSessionOwnsConversation(false);
    refresh();
  }, [refresh]);
  const conversationViews = toConversationViews(
    catalog.data?.conversations,
    labels.conversationNewChat,
  );
  const runningConversationIds = catalog.data?.runningConversationIds ?? NO_RUNNING_CONVERSATIONS;
  const isBusy =
    isWorkflowBusyStatus(sessionStatus) || runningConversationIds.has(activeConversationId);
  const historyContent = selectWorkflowHistoryContent({
    error: history.error,
    isLocalDraft,
    isPending: history.isPending,
    isRecoveryPending: recovery.isPending,
    labels,
    onRetry: () => void history.refetch(),
    preserveSession: sessionOwnsConversation,
    session: (
      <WorkflowChatSession
        activeTurn={isLocalDraft ? undefined : recovery.activeTurn}
        hostBridge={hostBridge}
        hostContextSelection={hostContextSelection}
        initialMessages={isLocalDraft ? [] : (history.data ?? [])}
        key={`${activeConversationId}:${sessionRevision}`}
        labels={labels}
        onRunAccepted={handleRunAccepted}
        onRunTerminal={handleRunTerminal}
        onStatusChange={setSessionStatus}
        quickActions={quickActions}
        reasoningVisibility={reasoningVisibility ?? DEFAULT_REASONING_VISIBILITY}
        renderActivityItem={renderActivityItem}
        renderAgentMark={renderAgentMark}
        sendOnEnter={!sendPreference.sendWithCtrlEnter}
        toolDetail={toolDetailPreference.toolDetail}
        workflowChat={conversationClient}
        modelSelection={modelSelection}
        toolSelection={toolSelection}
      />
    ),
  });
  return (
    <SideChatPanelView
      appearance={appearance}
      content={historyContent}
      conversations={conversationViews}
      hasPersistedSelection={!isLocalDraft}
      isBusy={isBusy}
      labels={labels}
      onClose={onClose}
      onNewConversation={selectNewConversation}
      onRefresh={refreshPanel}
      onSelectConversation={selectPersistedConversation}
      renderAgentMark={renderAgentMark}
      runningConversationIds={runningConversationIds}
      selectedConversationId={activeConversationId}
      sendPreference={sendPreference}
      theme={theme}
      toolDetailPreference={toolDetailPreference}
    />
  );
}
function isWorkflowBusyStatus(status: WorkflowWidgetChatStatus): boolean {
  return (
    status === WORKFLOW_WIDGET_CHAT_STATUS.SUBMITTED ||
    status === WORKFLOW_WIDGET_CHAT_STATUS.STREAMING
  );
}
