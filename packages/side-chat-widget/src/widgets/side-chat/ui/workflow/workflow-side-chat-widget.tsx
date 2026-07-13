import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { DEFAULT_REASONING_VISIBILITY } from "#entities/settings";
import {
  readWorkflowActiveTurn,
  readWorkflowChatHistory,
  readWorkflowConversations,
} from "#entities/workflow-chat";
import type { ConversationSummaryView } from "#features/conversation";
import { ClosedWidgetLauncher, ResizablePanel, useWidgetPanelSize } from "#features/panel";
import { useSendPreference, useToolDetailPreference } from "#features/settings";
import { useWidgetAppearance, useWidgetTheme } from "#features/theme";
import { resolveWidgetLabels, WidgetLabelsProvider } from "#shared/lib/widget-labels";
import { Conversation, ConversationContent } from "#shared/ui/conversation";
import { ErrorNotice } from "#shared/ui/error-notice";
import { SideChatWidgetRoot } from "#shared/ui/widget-root";

import type { WorkflowSideChatWidgetProps } from "../../model/side-chat-widget.types.js";
import { WorkflowChatSession } from "./workflow-chat-session.js";
import { WorkflowPanelView } from "./workflow-panel-view.js";

const WORKFLOW_QUERY = {
  ACTIVE_TURN: "active-turn",
  CONVERSATIONS: "conversations",
  HISTORY: "history",
  SCOPE: "workflow-chat",
} as const;

/** Render a workspace's conversations through the native workflow transport. */
export function WorkflowSideChatWidget({
  defaultOpen = true,
  defaultPanelSize,
  defaultTheme,
  labels: labelsProp,
  hostBridge,
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
          onClose={() => {
            panelActions?.onClose?.();
            requestOpenChange(false);
          }}
          quickActions={quickActions}
          reasoningVisibility={reasoningVisibility}
          renderAgentMark={renderAgentMark}
          theme={theme}
          workflowChat={workflowChat}
        />
      </ResizablePanel>
    </WidgetLabelsProvider>
  );
}

/**
 * Owns which conversation is active and the workspace conversation list, then
 * seeds one keyed chat session per conversation. Switching remounts the session
 * (fresh transport + history seed); a settled turn refreshes the list so a new
 * conversation and its generated title appear.
 */
function selectWorkflowHistoryContent({
  error,
  isLocalDraft,
  isPending,
  labels,
  onRetry,
  session,
}: Readonly<{
  error: Error | null;
  isLocalDraft: boolean;
  isPending: boolean;
  labels: ReturnType<typeof resolveWidgetLabels>;
  onRetry: () => void;
  session: ReactNode;
}>): ReactNode {
  if (!isLocalDraft && isPending) {
    return <Conversation aria-label={labels.headerConversationFeed}>{null}</Conversation>;
  }
  if (!isLocalDraft && error) {
    return (
      <Conversation aria-label={labels.headerConversationFeed}>
        <ConversationContent className="mx-auto w-full max-w-measure-message px-4 pt-4">
          <ErrorNotice message={error.message} onRetry={onRetry} />
        </ConversationContent>
      </Conversation>
    );
  }
  return session;
}

function useWorkflowConversationSelection(initialConversationId: string): Readonly<{
  activeConversationId: string;
  isLocalDraft: boolean;
  selectConversation: (conversationId: string) => void;
  startNewConversation: () => void;
}> {
  const [activeConversationId, setActiveConversationId] = useState(initialConversationId);
  const [localDraftConversationId, setLocalDraftConversationId] = useState<string>();
  const startNewConversation = useCallback((): void => {
    const conversationId = crypto.randomUUID();
    setLocalDraftConversationId(conversationId);
    setActiveConversationId(conversationId);
  }, []);
  const selectConversation = useCallback((conversationId: string): void => {
    setLocalDraftConversationId(undefined);
    setActiveConversationId(conversationId);
  }, []);
  return {
    activeConversationId,
    isLocalDraft: localDraftConversationId === activeConversationId,
    selectConversation,
    startNewConversation,
  };
}

function WorkflowConversationPanel({
  appearance,
  hostBridge,
  labels,
  onClose,
  quickActions,
  reasoningVisibility,
  renderAgentMark,
  theme,
  workflowChat,
}: {
  readonly appearance: ReturnType<typeof useWidgetAppearance>;
  readonly hostBridge: WorkflowSideChatWidgetProps["hostBridge"];
  readonly labels: ReturnType<typeof resolveWidgetLabels>;
  readonly onClose: () => void;
  readonly quickActions: NonNullable<WorkflowSideChatWidgetProps["quickActions"]>;
  readonly reasoningVisibility: WorkflowSideChatWidgetProps["reasoningVisibility"];
  readonly renderAgentMark: WorkflowSideChatWidgetProps["renderAgentMark"];
  readonly theme: ReturnType<typeof useWidgetTheme>;
  readonly workflowChat: WorkflowSideChatWidgetProps["workflowChat"];
}): ReactNode {
  const queryClient = useQueryClient();
  const sendPreference = useSendPreference();
  const toolDetailPreference = useToolDetailPreference();
  const { activeConversationId, isLocalDraft, selectConversation, startNewConversation } =
    useWorkflowConversationSelection(workflowChat.conversationId);
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
  const conversationViews = useMemo<readonly ConversationSummaryView[]>(
    () =>
      (conversations.data ?? []).map((conversation) => ({
        id: conversation.id,
        title: conversation.title || labels.conversationNewChat,
        lastMessageAt: conversation.lastMessageAt,
      })),
    [conversations.data, labels.conversationNewChat],
  );
  const refreshConversations = useCallback((): void => {
    void queryClient.invalidateQueries({
      queryKey: [WORKFLOW_QUERY.SCOPE, WORKFLOW_QUERY.CONVERSATIONS, workflowChat.baseUrl],
    });
  }, [queryClient, workflowChat.baseUrl]);

  const historyContent = selectWorkflowHistoryContent({
    error: history.error,
    isLocalDraft,
    isPending: history.isPending,
    labels,
    onRetry: () => void history.refetch(),
    session: (
      <WorkflowChatSession
        activeTurn={isLocalDraft ? undefined : (discovery.data ?? undefined)}
        hostBridge={hostBridge}
        initialMessages={isLocalDraft ? [] : (history.data ?? [])}
        key={activeConversationId}
        labels={labels}
        onConversationsChanged={refreshConversations}
        quickActions={quickActions}
        reasoningVisibility={reasoningVisibility ?? DEFAULT_REASONING_VISIBILITY}
        renderAgentMark={renderAgentMark}
        sendOnEnter={!sendPreference.sendWithCtrlEnter}
        toolDetail={toolDetailPreference.toolDetail}
        workflowChat={conversationClient}
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
