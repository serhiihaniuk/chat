import { useChat } from "@ai-sdk/react";
import type { ChatOnErrorCallback, ChatOnFinishCallback, ChatStatus, FinishReason } from "ai";
import {
  isSideChatErrorCode,
  SIDE_CHAT_ERROR_CODES,
  SIDE_CHAT_ERROR_VOCABULARY,
  SIDE_CHAT_FINISH_REASONS,
  type SideChatFinishReason,
} from "@side-chat/stream-profile";
import { useRef, useState } from "react";

import {
  cancelWorkflowChatRun,
  createWorkflowChatTransport,
  normalizeWorkflowChatError,
  type WorkflowChatClient,
  type WorkflowChatHttpError,
  type WorkflowUIMessage,
} from "#entities/workflow-chat";

export const WORKFLOW_WIDGET_CHAT_STATUS = {
  ERROR: "error",
  IDLE: "idle",
  STREAMING: "streaming",
  SUBMITTED: "submitted",
} as const;

export type WorkflowWidgetChatStatus =
  (typeof WORKFLOW_WIDGET_CHAT_STATUS)[keyof typeof WORKFLOW_WIDGET_CHAT_STATUS];

export const WORKFLOW_CHAT_TERMINAL_KIND = {
  BLOCKED: "blocked",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  ERROR: "error",
  NONE: "none",
} as const;

export type WorkflowChatTerminal =
  | { readonly kind: "none" }
  | {
      readonly kind: "completed";
      readonly finishReason?: SideChatFinishReason | undefined;
      readonly messageId?: string | undefined;
      readonly partCount?: number | undefined;
    }
  | {
      readonly kind: "blocked";
      readonly messageId?: string | undefined;
      readonly partCount?: number | undefined;
    }
  | {
      readonly kind: "cancelled";
      readonly messageId?: string | undefined;
      readonly partCount?: number | undefined;
    }
  | {
      readonly kind: "error";
      readonly code: string;
      readonly message: string;
      readonly messageId?: string | undefined;
      readonly partCount?: number | undefined;
      readonly retryable: boolean;
    };

const AI_CHAT_STATUS_TO_WIDGET_STATUS: Readonly<Record<ChatStatus, WorkflowWidgetChatStatus>> = {
  error: WORKFLOW_WIDGET_CHAT_STATUS.ERROR,
  ready: WORKFLOW_WIDGET_CHAT_STATUS.IDLE,
  streaming: WORKFLOW_WIDGET_CHAT_STATUS.STREAMING,
  submitted: WORKFLOW_WIDGET_CHAT_STATUS.SUBMITTED,
};

export type WorkflowWidgetChat = Readonly<{
  cancelled: boolean;
  error: WorkflowChatHttpError | undefined;
  messages: readonly WorkflowUIMessage[];
  status: WorkflowWidgetChatStatus;
  terminal: WorkflowChatTerminal;
  retry: () => Promise<void>;
  stop: () => void;
  submitMessage: (text: string) => Promise<void>;
}>;

/** One native AI SDK chat state machine for one open conversation. */
export function useWorkflowWidgetChat(
  client: WorkflowChatClient,
  initialMessages: readonly WorkflowUIMessage[],
): WorkflowWidgetChat {
  const clientRef = useRef(client);
  clientRef.current = client;
  const activeRunIdRef = useRef<string | undefined>(undefined);
  const latestErrorRef = useRef<WorkflowChatHttpError | undefined>(undefined);
  const [cancelled, setCancelled] = useState(false);
  const [transportError, setTransportError] = useState<WorkflowChatHttpError | undefined>();
  const [terminal, setTerminal] = useState<WorkflowChatTerminal>({ kind: "none" });
  const [transport] = useState(() => createWidgetTransport(clientRef, activeRunIdRef));
  const chat = useChat<WorkflowUIMessage>({
    id: client.conversationId,
    messages: [...initialMessages],
    transport,
    onError: createWorkflowChatErrorHandler(latestErrorRef, setTransportError),
    onFinish: createWorkflowChatFinishHandler(latestErrorRef, setTerminal),
  });

  const submitMessage = async (text: string): Promise<void> => {
    setCancelled(false);
    setTerminal({ kind: "none" });
    latestErrorRef.current = undefined;
    setTransportError(undefined);
    chat.clearError();
    await chat.sendMessage({ text });
  };

  const retry = async (): Promise<void> => {
    setCancelled(false);
    setTerminal({ kind: "none" });
    latestErrorRef.current = undefined;
    setTransportError(undefined);
    chat.clearError();
    await chat.regenerate();
  };

  const stop = (): void => {
    const runId = activeRunIdRef.current;
    void chat.stop();
    chat.clearError();
    latestErrorRef.current = undefined;
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
    terminal,
    retry,
    stop,
    submitMessage,
  };
}

function createWidgetTransport(
  clientRef: { current: WorkflowChatClient },
  activeRunIdRef: { current: string | undefined },
) {
  return createWorkflowChatTransport({
    getClient: () => clientRef.current,
    onRunFinished: () => {
      activeRunIdRef.current = undefined;
    },
    onRunStarted: (runId) => {
      activeRunIdRef.current = runId;
    },
  });
}

function createWorkflowChatErrorHandler(
  latestErrorRef: { current: WorkflowChatHttpError | undefined },
  setTransportError: (error: WorkflowChatHttpError | undefined) => void,
): ChatOnErrorCallback {
  return (error) => {
    const normalized = normalizeWorkflowChatError(error);
    latestErrorRef.current = normalized;
    setTransportError(normalized);
  };
}

function createWorkflowChatFinishHandler(
  latestErrorRef: { current: WorkflowChatHttpError | undefined },
  setTerminal: (terminal: WorkflowChatTerminal) => void,
): ChatOnFinishCallback<WorkflowUIMessage> {
  return ({ isAbort, isError, message, finishReason }) => {
    setTerminal(
      terminalForFinish({
        error: latestErrorRef.current,
        finishReason,
        isAbort,
        isError,
        message,
      }),
    );
    latestErrorRef.current = undefined;
  };
}

function terminalForFinish({
  error,
  finishReason,
  isAbort,
  isError,
  message,
}: {
  readonly error: WorkflowChatHttpError | undefined;
  readonly finishReason: FinishReason | undefined;
  readonly isAbort: boolean;
  readonly isError: boolean;
  readonly message: WorkflowUIMessage;
}): WorkflowChatTerminal {
  const base = { messageId: message.id, partCount: message.parts.length };
  if (isAbort) return { kind: "cancelled", ...base };
  if (finishReason === SIDE_CHAT_FINISH_REASONS.CONTENT_FILTER) {
    return { kind: "blocked", ...base };
  }
  if (isError || finishReason === SIDE_CHAT_FINISH_REASONS.ERROR) {
    return errorTerminal(error, base);
  }
  return {
    kind: "completed",
    ...base,
    finishReason:
      finishReason !== undefined && isSideChatFinishReason(finishReason) ? finishReason : undefined,
  };
}

function errorTerminal(
  error: WorkflowChatHttpError | undefined,
  base: { readonly messageId: string; readonly partCount: number },
): WorkflowChatTerminal {
  if (error && isSideChatErrorCode(error.code)) {
    const profile = SIDE_CHAT_ERROR_VOCABULARY[error.code];
    return {
      kind: "error",
      code: error.code,
      message: profile.safeMessage,
      retryable: profile.retryable,
      ...base,
    };
  }
  const profile = SIDE_CHAT_ERROR_VOCABULARY[SIDE_CHAT_ERROR_CODES.PROVIDER_FAILED];
  return {
    kind: "error",
    code: SIDE_CHAT_ERROR_CODES.PROVIDER_FAILED,
    message: profile.safeMessage,
    retryable: profile.retryable,
    ...base,
  };
}

function isSideChatFinishReason(value: FinishReason): value is SideChatFinishReason {
  return (
    value === SIDE_CHAT_FINISH_REASONS.STOP ||
    value === SIDE_CHAT_FINISH_REASONS.LENGTH ||
    value === SIDE_CHAT_FINISH_REASONS.CONTENT_FILTER ||
    value === SIDE_CHAT_FINISH_REASONS.TOOL_CALLS ||
    value === SIDE_CHAT_FINISH_REASONS.ERROR ||
    value === SIDE_CHAT_FINISH_REASONS.OTHER
  );
}

const toWidgetStatus = (
  status: ChatStatus,
  error: WorkflowChatHttpError | undefined,
): WorkflowWidgetChatStatus =>
  error ? WORKFLOW_WIDGET_CHAT_STATUS.ERROR : AI_CHAT_STATUS_TO_WIDGET_STATUS[status];
