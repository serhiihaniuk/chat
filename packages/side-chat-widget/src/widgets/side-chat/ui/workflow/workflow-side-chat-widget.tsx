import { useQuery } from "@tanstack/react-query";
import { isTextUIPart, type UIMessage } from "ai";
import { useMemo, useState, type ReactNode } from "react";

import { readWorkflowChatHistory } from "#entities/workflow-chat";
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
  type WorkflowWidgetChatStatus,
} from "#features/workflow-chat";
import { resolveWidgetLabels, WidgetLabelsProvider } from "#shared/lib/widget-labels";
import { Composer } from "#shared/ui/composer";
import { Conversation, ConversationContent } from "#shared/ui/conversation";
import { ErrorNotice } from "#shared/ui/error-notice";
import { Message } from "#shared/ui/message";
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

const MESSAGE_RENDER_MODE = {
  STATIC: "static",
  STREAMING: "streaming",
} as const;

/** Render one conversation through the native workflow transport and chat state. */
export function WorkflowSideChatWidget({
  defaultOpen = true,
  defaultPanelSize,
  defaultTheme,
  labels: labelsProp,
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
  sendOnEnter,
  workflowChat,
}: {
  readonly initialMessages: readonly UIMessage[];
  readonly labels: ReturnType<typeof resolveWidgetLabels>;
  readonly sendOnEnter: boolean;
  readonly workflowChat: WorkflowSideChatWidgetProps["workflowChat"];
}) {
  const chat = useWorkflowWidgetChat(workflowChat, initialMessages);
  return (
    <>
      <Conversation aria-label={labels.headerConversationFeed}>
        <ConversationContent className="mx-auto min-h-full w-full max-w-measure-message gap-4 px-4 pt-4 pb-8">
          {chat.messages.map((message, index) => (
            <Message
              key={message.id}
              mode={
                isStreamingAssistant(chat.status, message, index, chat.messages)
                  ? MESSAGE_RENDER_MODE.STREAMING
                  : MESSAGE_RENDER_MODE.STATIC
              }
              role={
                message.role === UI_MESSAGE_ROLE.USER
                  ? UI_MESSAGE_ROLE.USER
                  : UI_MESSAGE_ROLE.ASSISTANT
              }
              text={textFromMessage(message)}
            />
          ))}
          {chat.error && <ErrorNotice message={chat.error.message} />}
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

function textFromMessage(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
}

function isStreamingAssistant(
  status: WorkflowWidgetChatStatus,
  message: UIMessage,
  index: number,
  messages: readonly UIMessage[],
): boolean {
  return (
    status === WORKFLOW_WIDGET_CHAT_STATUS.STREAMING &&
    message.role === UI_MESSAGE_ROLE.ASSISTANT &&
    index === messages.length - 1
  );
}
