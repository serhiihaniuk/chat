import { useEffect, useMemo } from "react";

import type { ReasoningVisibility, ToolDetailLevel } from "#entities/settings";
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
  WORKFLOW_WIDGET_CHAT_STATUS,
  type WorkflowWidgetChatStatus,
  type WorkflowChatTerminal,
  WorkflowMessageTimeline,
} from "#features/workflow-chat";
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
  activeTurn,
  onRunAccepted,
  onRunTerminal,
  onStatusChange,
  quickActions,
  reasoningVisibility,
  renderAgentMark,
  sendOnEnter,
  toolDetail,
  workflowChat,
  modelSelection,
  toolSelection,
}: {
  readonly initialMessages: readonly WorkflowUIMessage[];
  readonly labels: WidgetLabels;
  readonly sendOnEnter: boolean;
  readonly hostBridge: WorkflowSideChatWidgetProps["hostBridge"];
  readonly activeTurn: WorkflowActiveTurn | undefined;
  readonly onRunAccepted: (runId: string) => void;
  readonly onRunTerminal: (runId: string) => void;
  readonly onStatusChange: (status: WorkflowWidgetChatStatus) => void;
  readonly quickActions: NonNullable<WorkflowSideChatWidgetProps["quickActions"]>;
  readonly reasoningVisibility: ReasoningVisibility;
  readonly renderAgentMark: WorkflowSideChatWidgetProps["renderAgentMark"];
  readonly toolDetail: ToolDetailLevel;
  readonly workflowChat: WorkflowConversationClient;
  readonly modelSelection: WorkflowModelSelection;
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
  const chat = useWorkflowWidgetChat(sessionClient, initialMessages, hostBridge, activeTurn, {
    onRunAccepted,
    onRunTerminal,
  });
  useEffect(() => onStatusChange(chat.status), [chat.status, onStatusChange]);
  const lastAssistantIndex = findLastAssistantIndex(chat.messages);
  const contextUsedTokens = projectLatestAssistantUsage(chat.messages);
  const terminalMessageIsRendered = hasTerminalMessage(chat.terminal, chat.messages);
  const suggestions = useMemo(() => toEmptyStateSuggestions(quickActions), [quickActions]);
  const isEmpty = chat.messages.length === 0 && chat.terminal.kind === "none" && !chat.error;
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
                    chat.status,
                    message,
                    index,
                    lastAssistantIndex,
                  )}
                  message={message}
                  onRetry={() => void chat.retry()}
                  approvalDecisions={chat.approvalDecisions}
                  onApprovalDecision={chat.decideApproval}
                  reasoningVisibility={reasoningVisibility}
                  terminal={terminalForMessage(
                    chat.terminal,
                    message.id,
                    index,
                    lastAssistantIndex,
                  )}
                  toolDetail={toolDetail}
                />
              ))}
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
                  reasoningVisibility={reasoningVisibility}
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
        labels={labels}
        models={modelSelection.footerModels}
        onModelSelect={modelSelection.onModelSelect}
        onReasoningEffortSelect={modelSelection.setSelectedReasoningEffort}
        onSubmitMessage={chat.submitMessage}
        onToggleTool={toolSelection.toggleTool}
        reasoningEfforts={modelSelection.reasoningEfforts}
        selectedModelKey={modelSelection.selectedModelKey}
        selectedReasoningEffort={modelSelection.selectedReasoningEffort}
        sendOnEnter={sendOnEnter}
        status={chat.status}
        stop={chat.stop}
        tools={toolSelection.tools}
      />
    </>
  );
}

function isStreamingAssistant(
  status: (typeof WORKFLOW_WIDGET_CHAT_STATUS)[keyof typeof WORKFLOW_WIDGET_CHAT_STATUS],
  message: WorkflowUIMessage,
  index: number,
  lastAssistantIndex: number,
): boolean {
  return (
    status === WORKFLOW_WIDGET_CHAT_STATUS.STREAMING &&
    message.role === UI_MESSAGE_ROLE.ASSISTANT &&
    index === lastAssistantIndex
  );
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
