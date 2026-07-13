import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";

import {
  readWorkflowActiveTurn,
  readWorkflowChatHistory,
  type WorkflowActiveTurn,
  type WorkflowUIMessage,
} from "#entities/workflow-chat";
import {
  ClosedWidgetLauncher,
  ResizablePanel,
  useWidgetPanelSize,
  WidgetHeader,
} from "#features/panel";
import { useSendPreference } from "#features/settings";
import { useWidgetAppearance, useWidgetTheme } from "#features/theme";
import {
  useWorkflowWidgetChat,
  WORKFLOW_WIDGET_CHAT_STATUS,
  type WorkflowChatTerminal,
  WorkflowMessageTimeline,
} from "#features/workflow-chat";
import { resolveWidgetLabels, WidgetLabelsProvider } from "#shared/lib/widget-labels";
import { Composer } from "#shared/ui/composer";
import { Conversation, ConversationContent } from "#shared/ui/conversation";
import { ErrorNotice } from "#shared/ui/error-notice";
import { SideChatWidgetRoot } from "#shared/ui/widget-root";

import type { WorkflowSideChatWidgetProps } from "../../model/side-chat-widget.types.js";

const WORKFLOW_HISTORY_QUERY = {
  RESOURCE: "history",
  SCOPE: "workflow-chat",
} as const;

const UI_MESSAGE_ROLE = {
  ASSISTANT: "assistant",
  USER: "user",
} as const;

/** Render one conversation through the native workflow transport and chat state. */
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
  const sendPreference = useSendPreference();
  const history = useQuery({
    queryKey: [
      WORKFLOW_HISTORY_QUERY.SCOPE,
      WORKFLOW_HISTORY_QUERY.RESOURCE,
      workflowChat.baseUrl,
      workflowChat.conversationId,
    ],
    queryFn: ({ signal }) => readWorkflowChatHistory(workflowChat, signal),
  });
  const discovery = useQuery({
    queryKey: [
      WORKFLOW_HISTORY_QUERY.SCOPE,
      "active-turn",
      workflowChat.baseUrl,
      workflowChat.conversationId,
    ],
    // TanStack forbids an undefined result, so a run-less conversation reads null.
    queryFn: async ({ signal }) => (await readWorkflowActiveTurn(workflowChat, signal)) ?? null,
  });

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

  let historyContent: ReactNode;
  if (history.isPending) {
    historyContent = <Conversation aria-label={labels.headerConversationFeed}>{null}</Conversation>;
  } else if (history.error) {
    historyContent = (
      <Conversation aria-label={labels.headerConversationFeed}>
        <ConversationContent className="mx-auto w-full max-w-measure-message px-4 pt-4">
          <ErrorNotice message={history.error.message} onRetry={() => void history.refetch()} />
        </ConversationContent>
      </Conversation>
    );
  } else {
    historyContent = (
      <WorkflowChatSession
        initialMessages={history.data ?? []}
        labels={labels}
        sendOnEnter={!sendPreference.sendWithCtrlEnter}
        hostBridge={hostBridge}
        activeTurn={discovery.data ?? undefined}
        workflowChat={workflowChat}
      />
    );
  }

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
        <WidgetHeader
          onClose={() => {
            panelActions?.onClose?.();
            requestOpenChange(false);
          }}
          title={labels.title}
        />
        {historyContent}
      </ResizablePanel>
    </WidgetLabelsProvider>
  );
}

function WorkflowChatSession({
  initialMessages,
  labels,
  hostBridge,
  activeTurn,
  sendOnEnter,
  workflowChat,
}: {
  readonly initialMessages: readonly WorkflowUIMessage[];
  readonly labels: ReturnType<typeof resolveWidgetLabels>;
  readonly sendOnEnter: boolean;
  readonly hostBridge: WorkflowSideChatWidgetProps["hostBridge"];
  readonly activeTurn: WorkflowActiveTurn | undefined;
  readonly workflowChat: WorkflowSideChatWidgetProps["workflowChat"];
}) {
  const chat = useWorkflowWidgetChat(workflowChat, initialMessages, hostBridge, activeTurn);
  const lastAssistantIndex = findLastAssistantIndex(chat.messages);
  const terminalMessageIsRendered = hasTerminalMessage(chat.terminal, chat.messages);
  return (
    <>
      <Conversation aria-label={labels.headerConversationFeed}>
        <ConversationContent className="mx-auto min-h-full w-full max-w-measure-message gap-4 px-4 pt-4 pb-8">
          {chat.messages.map((message, index) => (
            <WorkflowMessageTimeline
              key={message.id}
              isStreaming={isStreamingAssistant(chat.status, message, index, lastAssistantIndex)}
              message={message}
              onRetry={() => void chat.retry()}
              approvalDecisions={chat.approvalDecisions}
              onApprovalDecision={chat.decideApproval}
              terminal={terminalForMessage(chat.terminal, message.id, index, lastAssistantIndex)}
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
              terminal={chat.terminal}
            />
          ) : null}
          {chat.error ? (
            chat.error.status === undefined ? (
              // A transport drop carries no HTTP status; offer a reconnect that
              // reattaches to the still-running turn. Typed 4xx are not retried.
              <ErrorNotice
                message={labels.noticeConnectionLost}
                onRetry={() => void chat.reconnect()}
              />
            ) : (
              <ErrorNotice message={chat.error.message} />
            )
          ) : null}
        </ConversationContent>
      </Conversation>
      <footer className="shrink-0 px-3 pb-3">
        <Composer
          className="mx-auto w-full max-w-measure-message"
          modelSelector={null}
          onStop={chat.stop}
          onSubmit={chat.submitMessage}
          placeholder={labels.placeholder}
          sendLabel={labels.send}
          sendOnEnter={sendOnEnter}
          status={chat.status}
          toolsMenu={null}
        />
      </footer>
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
