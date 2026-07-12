import { useChat } from "@ai-sdk/react";
import type { ChatStatus, UIMessage } from "ai";
import { useRef, useState } from "react";

import {
  cancelWorkflowChatRun,
  createWorkflowChatTransport,
  normalizeWorkflowChatError,
  type WorkflowChatClient,
  type WorkflowChatHttpError,
} from "#entities/workflow-chat";

export const WORKFLOW_WIDGET_CHAT_STATUS = {
  ERROR: "error",
  IDLE: "idle",
  STREAMING: "streaming",
  SUBMITTED: "submitted",
} as const;

export type WorkflowWidgetChatStatus =
  (typeof WORKFLOW_WIDGET_CHAT_STATUS)[keyof typeof WORKFLOW_WIDGET_CHAT_STATUS];

const AI_CHAT_STATUS_TO_WIDGET_STATUS: Readonly<Record<ChatStatus, WorkflowWidgetChatStatus>> = {
  error: WORKFLOW_WIDGET_CHAT_STATUS.ERROR,
  ready: WORKFLOW_WIDGET_CHAT_STATUS.IDLE,
  streaming: WORKFLOW_WIDGET_CHAT_STATUS.STREAMING,
  submitted: WORKFLOW_WIDGET_CHAT_STATUS.SUBMITTED,
};

export type WorkflowWidgetChat = Readonly<{
  cancelled: boolean;
  error: WorkflowChatHttpError | undefined;
  messages: readonly UIMessage[];
  status: WorkflowWidgetChatStatus;
  stop: () => void;
  submitMessage: (text: string) => Promise<void>;
}>;

/** One native AI SDK chat state machine for one open conversation. */
export function useWorkflowWidgetChat(
  client: WorkflowChatClient,
  initialMessages: readonly UIMessage[],
): WorkflowWidgetChat {
  const clientRef = useRef(client);
  clientRef.current = client;
  const activeRunIdRef = useRef<string | undefined>(undefined);
  const [cancelled, setCancelled] = useState(false);
  const [transportError, setTransportError] = useState<WorkflowChatHttpError | undefined>();
  const [transport] = useState(() =>
    createWorkflowChatTransport({
      getClient: () => clientRef.current,
      onRunFinished: () => {
        activeRunIdRef.current = undefined;
      },
      onRunStarted: (runId) => {
        activeRunIdRef.current = runId;
      },
    }),
  );
  const chat = useChat({
    id: client.conversationId,
    messages: [...initialMessages],
    transport,
    onError: (error) => setTransportError(normalizeWorkflowChatError(error)),
  });

  const submitMessage = async (text: string): Promise<void> => {
    setCancelled(false);
    setTransportError(undefined);
    chat.clearError();
    await chat.sendMessage({ text });
  };

  const stop = (): void => {
    const runId = activeRunIdRef.current;
    void chat.stop();
    chat.clearError();
    setTransportError(undefined);
    setCancelled(true);
    activeRunIdRef.current = undefined;
    if (runId) void cancelWorkflowChatRun(clientRef.current, runId).catch(() => undefined);
  };

  return {
    cancelled,
    error: transportError,
    messages: chat.messages,
    status: toWidgetStatus(chat.status, transportError),
    stop,
    submitMessage,
  };
}

const toWidgetStatus = (
  status: ChatStatus,
  error: WorkflowChatHttpError | undefined,
): WorkflowWidgetChatStatus =>
  error ? WORKFLOW_WIDGET_CHAT_STATUS.ERROR : AI_CHAT_STATUS_TO_WIDGET_STATUS[status];
