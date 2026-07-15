import { useMemo } from "react";

import type { ToolDetailLevel } from "#entities/settings";
import type {
  WorkflowActiveTurn,
  WorkflowConversationClient,
  WorkflowUIMessage,
} from "#entities/workflow-chat";
import {
  emptyStateDescription,
  toEmptyStateSuggestions,
  WidgetEmptyState,
} from "#features/conversation";
import { WidgetFooter } from "#features/prompt";
import {
  projectLatestAssistantUsage,
  useWorkflowWidgetChat,
  type WorkflowModelSelection,
  type WorkflowWidgetChatSessionRegistry,
  WORKFLOW_WIDGET_CHAT_PHASE,
  WORKFLOW_WIDGET_CHAT_STATUS,
  type WorkflowChatTerminal,
  type WorkflowWidgetChatPhase,
  WorkflowMessageTimeline,
  WorkflowPendingTimeline,
} from "#features/workflow-chat";
import type { WorkflowHostContextSelection } from "../../model/selection/side-chat-host-context-selection.js";
import type { WidgetToolSelection } from "../../model/selection/side-chat-tool-selection.js";
import type { WidgetLabels } from "#shared/lib/widget-labels";
import { Conversation, ConversationContent } from "#shared/ui/conversation";
import { ErrorNotice } from "#shared/ui/error-notice";

import type { WorkflowSideChatWidgetProps } from "../../model/side-chat-widget.types.js";

const UI_MESSAGE_ROLE = {
  ASSISTANT: "assistant",
  USER: "user",
} as const;

/** The conversation feed and composer for one native workflow chat. */
export function WorkflowChatSession({
  initialMessages,
  labels,
  hostBridge,
  hostContextSelection,
  activeTurn,
  onRunAccepted,
  onRunReconciled,
  onRunTerminal,
  quickActions,
  renderActivityItem,
  renderAgentMark,
  sendOnEnter,
  toolDetail,
  workflowChat,
  modelSelection,
  sessionRegistry,
  stateObservationId,
  toolSelection,
}: {
  readonly initialMessages: readonly WorkflowUIMessage[];
  readonly labels: WidgetLabels;
  readonly sendOnEnter: boolean;
  readonly hostBridge: WorkflowSideChatWidgetProps["hostBridge"];
  readonly hostContextSelection: WorkflowHostContextSelection;
  readonly activeTurn: WorkflowActiveTurn | undefined;
  readonly onRunAccepted: (runId: string) => void;
  readonly onRunReconciled: (runId: string) => void;
  readonly onRunTerminal: (runId: string) => void;
  readonly quickActions: NonNullable<WorkflowSideChatWidgetProps["quickActions"]>;
  readonly renderActivityItem: WorkflowSideChatWidgetProps["renderActivityItem"];
  readonly renderAgentMark: WorkflowSideChatWidgetProps["renderAgentMark"];
  readonly toolDetail: ToolDetailLevel;
  readonly workflowChat: WorkflowConversationClient;
  readonly modelSelection: WorkflowModelSelection;
  readonly sessionRegistry: WorkflowWidgetChatSessionRegistry;
  readonly stateObservationId: string | undefined;
  readonly toolSelection: WidgetToolSelection;
}) {
  const sessionClient = useMemo(
    () => ({
      ...workflowChat,
      modelPreference: modelSelection.modelPreference,
      reasoningEffort: modelSelection.reasoningEffort,
      enabledToolNames: toolSelection.enabledToolNames,
    }),
    [
      workflowChat,
      modelSelection.modelPreference,
      modelSelection.reasoningEffort,
      toolSelection.enabledToolNames,
    ],
  );
  const chat = useWorkflowWidgetChat({
    activeTurn,
    client: sessionClient,
    hostBridge,
    includeHostContext: hostContextSelection.enabled,
    initialMessages,
    lifecycle: {
      onRunAccepted,
      onRunReconciled,
      onRunTerminal,
    },
    sessionRegistry,
    stateObservationId,
  });
  const lastAssistantIndex = findLastAssistantIndex(chat.messages);
  const contextUsedTokens = projectLatestAssistantUsage(chat.messages);
  const terminalMessageIsRendered = hasTerminalMessage(chat.terminal, chat.messages);
  const suggestions = useMemo(() => toEmptyStateSuggestions(quickActions), [quickActions]);
  const busy = isBusyPhase(chat.phase);
  const showDetachedPending =
    busy && (chat.messages.length === 0 || lastAssistantIndex !== chat.messages.length - 1);
  const isEmpty = isEmptyChat(chat.messages, chat.terminal, chat.error, busy);
  return (
    <>
      <Conversation aria-label={labels.headerConversationFeed}>
        <ConversationContent className="mx-auto min-h-full w-full max-w-measure-message gap-4 px-4 pt-4 pb-8">
          {isEmpty ? (
            <WidgetEmptyState
              assistantTitle={labels.title}
              description={emptyStateDescription(hostBridge, labels)}
              onSelectSuggestion={(prompt) => void chat.submitMessage(prompt)}
              renderAgentMark={renderAgentMark}
              suggestions={suggestions}
              title={labels.emptyStateTitle}
            />
          ) : (
            <>
              {chat.messages.map((message, index) => (
                <WorkflowMessageTimeline
                  key={message.id}
                  isStreaming={isStreamingAssistant(
                    chat.phase,
                    message,
                    index,
                    chat.messages.length,
                  )}
                  message={message}
                  onRetry={() => void chat.retry()}
                  approvalDecisions={chat.approvalDecisions}
                  onApprovalDecision={chat.decideApproval}
                  renderActivityItem={renderActivityItem}
                  terminal={terminalForMessage(
                    chat.terminal,
                    message.id,
                    index,
                    lastAssistantIndex,
                  )}
                  toolDetail={toolDetail}
                />
              ))}
              {showDetachedPending ? <WorkflowPendingTimeline /> : null}
              {chat.terminal.kind !== "none" && !terminalMessageIsRendered ? (
                <WorkflowMessageTimeline
                  message={{
                    id: chat.terminal.messageId ?? "workflow-terminal",
                    role: "assistant",
                    parts: [],
                  }}
                  onRetry={() => void chat.retry()}
                  approvalDecisions={chat.approvalDecisions}
                  onApprovalDecision={chat.decideApproval}
                  renderActivityItem={renderActivityItem}
                  terminal={chat.terminal}
                  toolDetail={toolDetail}
                />
              ) : null}
              <WorkflowErrorNotice
                error={chat.error}
                connectionLostMessage={labels.noticeConnectionLost}
                onReconnect={() => void chat.reconnect()}
              />
            </>
          )}
        </ConversationContent>
      </Conversation>
      <WidgetFooter
        contextUsedTokens={contextUsedTokens}
        contextWindowTokens={modelSelection.contextWindowTokens}
        includeHostContext={hostContextSelection.enabled}
        labels={labels}
        models={modelSelection.footerModels}
        onModelSelect={modelSelection.onModelSelect}
        onReasoningEffortSelect={modelSelection.setSelectedReasoningEffort}
        onSubmitMessage={chat.submitMessage}
        onToggleHostContext={
          hostContextSelection.available ? hostContextSelection.toggle : undefined
        }
        onToggleTool={toolSelection.toggleTool}
        reasoningEfforts={modelSelection.reasoningEfforts}
        selectedModelKey={modelSelection.selectedModelKey}
        selectedReasoningEffort={modelSelection.selectedReasoningEffort}
        sendOnEnter={sendOnEnter}
        status={toComposerStatus(chat.phase)}
        stop={chat.stop}
        tools={toolSelection.tools}
      />
    </>
  );
}

function isEmptyChat(
  messages: readonly WorkflowUIMessage[],
  terminal: WorkflowChatTerminal,
  error: unknown,
  busy: boolean,
): boolean {
  return messages.length === 0 && terminal.kind === "none" && !error && !busy;
}

function isStreamingAssistant(
  phase: WorkflowWidgetChatPhase,
  message: WorkflowUIMessage,
  index: number,
  messageCount: number,
): boolean {
  // During submit there can be a user message without its assistant placeholder.
  // Only the final message can own the active stream; otherwise the previous
  // assistant's completed thinking fold would reopen for the new turn.
  return (
    isGeneratingPhase(phase) &&
    message.role === UI_MESSAGE_ROLE.ASSISTANT &&
    index === messageCount - 1
  );
}

function isGeneratingPhase(phase: WorkflowWidgetChatPhase): boolean {
  return (
    phase === WORKFLOW_WIDGET_CHAT_PHASE.REATTACHING ||
    phase === WORKFLOW_WIDGET_CHAT_PHASE.SUBMITTED ||
    phase === WORKFLOW_WIDGET_CHAT_PHASE.STREAMING
  );
}

function isBusyPhase(phase: WorkflowWidgetChatPhase): boolean {
  return isGeneratingPhase(phase) || phase === WORKFLOW_WIDGET_CHAT_PHASE.SETTLING;
}

function toComposerStatus(
  phase: WorkflowWidgetChatPhase,
): (typeof WORKFLOW_WIDGET_CHAT_STATUS)[keyof typeof WORKFLOW_WIDGET_CHAT_STATUS] {
  if (phase === WORKFLOW_WIDGET_CHAT_PHASE.ERROR) return WORKFLOW_WIDGET_CHAT_STATUS.ERROR;
  if (phase === WORKFLOW_WIDGET_CHAT_PHASE.IDLE) return WORKFLOW_WIDGET_CHAT_STATUS.IDLE;
  if (phase === WORKFLOW_WIDGET_CHAT_PHASE.STREAMING) {
    return WORKFLOW_WIDGET_CHAT_STATUS.STREAMING;
  }
  return WORKFLOW_WIDGET_CHAT_STATUS.SUBMITTED;
}

function WorkflowErrorNotice({
  error,
  connectionLostMessage,
  onReconnect,
}: {
  readonly error: Readonly<{ message: string; status?: number | undefined }> | undefined;
  readonly connectionLostMessage: string;
  readonly onReconnect: () => void;
}) {
  if (!error) return null;
  if (error.status !== undefined) return <ErrorNotice message={error.message} />;
  // A transport drop carries no HTTP status; offer a reconnect that reattaches
  // to the still-running turn. Typed 4xx errors are not retried.
  return <ErrorNotice message={connectionLostMessage} onRetry={onReconnect} />;
}

function findLastAssistantIndex(messages: readonly WorkflowUIMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === UI_MESSAGE_ROLE.ASSISTANT) return index;
  }
  return -1;
}

function terminalForMessage(
  terminal: WorkflowChatTerminal,
  messageId: string,
  index: number,
  lastAssistantIndex: number,
): WorkflowChatTerminal | undefined {
  if (terminal.kind === "none") return undefined;
  if (terminal.messageId === messageId) return terminal;
  if (terminal.messageId === undefined && index === lastAssistantIndex) return terminal;
  return undefined;
}

function hasTerminalMessage(
  terminal: WorkflowChatTerminal,
  messages: readonly WorkflowUIMessage[],
): boolean {
  if (terminal.kind === "none" || terminal.messageId === undefined) return false;
  return messages.some((message) => message.id === terminal.messageId);
}
