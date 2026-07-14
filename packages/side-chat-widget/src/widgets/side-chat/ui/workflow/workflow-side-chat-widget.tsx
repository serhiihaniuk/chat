import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { DEFAULT_REASONING_VISIBILITY } from "#entities/settings";
import {
  readWorkflowActiveTurn,
  readWorkflowChatHistory,
  readWorkflowConversations,
  type WorkflowConversationSummary,
} from "#entities/workflow-chat";
import type { ConversationSummaryView } from "#features/conversation";
import { ClosedWidgetLauncher, ResizablePanel, useWidgetPanelSize } from "#features/panel";
import { useSendPreference, useToolDetailPreference } from "#features/settings";
import { useWorkflowModelSelection, type WorkflowModelSelection } from "#features/workflow-chat";
import { useWidgetAppearance, useWidgetTheme } from "#features/theme";
import { resolveWidgetLabels, WidgetLabelsProvider } from "#shared/lib/widget-labels";
import { SideChatWidgetRoot } from "#shared/ui/widget-root";

import type { WorkflowSideChatWidgetProps } from "../../model/side-chat-widget.types.js";
import {
  useWorkflowToolSelection,
  type WidgetToolSelection,
} from "../../model/selection/side-chat-tool-selection.js";
import { useWorkflowConversationSelection } from "../../model/selection/workflow/use-workflow-conversation-selection.js";
import { resolveWorkflowRecoveryValidation } from "../../model/selection/workflow-recovery/workflow-recovery-validation.js";
import { WorkflowChatSession } from "./workflow-chat-session.js";
import { selectWorkflowHistoryContent } from "./workflow-history-content.js";
import { WorkflowPanelView } from "./workflow-panel-view.js";

const WORKFLOW_QUERY = {
  ACTIVE_TURN: "active-turn",
  CONVERSATIONS: "conversations",
  HISTORY: "history",
  SCOPE: "workflow-chat",
} as const;

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
          labels={labels}
          initialConversationId={initialConversationId}
          onClose={() => {
            panelActions?.onClose?.();
            requestOpenChange(false);
          }}
          quickActions={quickActions}
          reasoningVisibility={reasoningVisibility}
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
  initialConversationId,
  labels,
  onClose,
  quickActions,
  reasoningVisibility,
  renderAgentMark,
  theme,
  workflowChat,
  workflowActiveTurnStorageKey,
  modelSelection,
  toolSelection,
}: {
  readonly appearance: ReturnType<typeof useWidgetAppearance>;
  readonly hostBridge: WorkflowSideChatWidgetProps["hostBridge"];
  readonly initialConversationId: WorkflowSideChatWidgetProps["initialConversationId"];
  readonly labels: ReturnType<typeof resolveWidgetLabels>;
  readonly onClose: () => void;
  readonly quickActions: NonNullable<WorkflowSideChatWidgetProps["quickActions"]>;
  readonly reasoningVisibility: WorkflowSideChatWidgetProps["reasoningVisibility"];
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
  const conversationClient = useMemo(
    () => ({ ...workflowChat, conversationId: activeConversationId }),
    [workflowChat, activeConversationId],
  );
  const conversations = useQuery({
    queryKey: [WORKFLOW_QUERY.SCOPE, WORKFLOW_QUERY.CONVERSATIONS, workflowChat.baseUrl],
    queryFn: ({ signal }) => readWorkflowConversations(workflowChat, signal),
  });
  const history = useQuery({
    queryKey: [
      WORKFLOW_QUERY.SCOPE,
      WORKFLOW_QUERY.HISTORY,
      workflowChat.baseUrl,
      activeConversationId,
    ],
    enabled: !isLocalDraft,
    queryFn: ({ signal }) => readWorkflowChatHistory(conversationClient, signal),
  });
  const discovery = useQuery({
    queryKey: [
      WORKFLOW_QUERY.SCOPE,
      WORKFLOW_QUERY.ACTIVE_TURN,
      workflowChat.baseUrl,
      activeConversationId,
    ],
    enabled: !isLocalDraft,
    // TanStack forbids an undefined result, so a run-less conversation reads null.
    queryFn: async ({ signal }) =>
      (await readWorkflowActiveTurn(conversationClient, signal)) ?? null,
  });
  const conversationViews = toConversationViews(conversations.data, labels.conversationNewChat);
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
  const refreshConversations = useCallback((): void => {
    void queryClient.invalidateQueries({
      queryKey: [WORKFLOW_QUERY.SCOPE, WORKFLOW_QUERY.CONVERSATIONS, workflowChat.baseUrl],
    });
  }, [queryClient, workflowChat.baseUrl]);

  const historyContent = selectWorkflowHistoryContent({
    error: history.error,
    isLocalDraft,
    isPending: history.isPending,
    isRecoveryPending: recovery.isPending,
    labels,
    onRetry: () => void history.refetch(),
    session: (
      <WorkflowChatSession
        activeTurn={isLocalDraft ? undefined : recovery.activeTurn}
        hostBridge={hostBridge}
        initialMessages={isLocalDraft ? [] : (history.data ?? [])}
        key={activeConversationId}
        labels={labels}
        onConversationsChanged={refreshConversations}
        onRunAccepted={acceptedRun}
        onRunTerminal={clearTerminalRun}
        quickActions={quickActions}
        reasoningVisibility={reasoningVisibility ?? DEFAULT_REASONING_VISIBILITY}
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
    <WorkflowPanelView
      activeConversationId={activeConversationId}
      appearance={appearance}
      conversations={conversationViews}
      historyContent={historyContent}
      labels={labels}
      onClose={onClose}
      onNewConversation={startNewConversation}
      onSelectConversation={selectConversation}
      renderAgentMark={renderAgentMark}
      sendPreference={sendPreference}
      theme={theme}
      toolDetailPreference={toolDetailPreference}
    />
  );
}
