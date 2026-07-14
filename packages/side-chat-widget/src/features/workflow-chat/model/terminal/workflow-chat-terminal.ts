import type { ChatOnErrorCallback, ChatOnFinishCallback, FinishReason } from "ai";
import {
  isSideChatErrorCode,
  SIDE_CHAT_ERROR_CODES,
  SIDE_CHAT_ERROR_VOCABULARY,
  SIDE_CHAT_FINISH_REASONS,
  type SideChatFinishReason,
} from "@side-chat/stream-profile";

import {
  normalizeWorkflowChatError,
  type WorkflowChatHttpError,
  type WorkflowUIMessage,
} from "#entities/workflow-chat";

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

export function createWorkflowChatErrorHandler(
  latestErrorRef: { current: WorkflowChatHttpError | undefined },
  setTransportError: (error: WorkflowChatHttpError | undefined) => void,
): ChatOnErrorCallback {
  return (error) => {
    const normalized = normalizeWorkflowChatError(error);
    latestErrorRef.current = normalized;
    setTransportError(normalized);
  };
}

export function createWorkflowChatFinishHandler(
  latestErrorRef: { current: WorkflowChatHttpError | undefined },
  setTerminal: (terminal: WorkflowChatTerminal) => void,
  onFinish?: (
    terminal: WorkflowChatTerminal,
    message: WorkflowUIMessage,
    error: WorkflowChatHttpError | undefined,
  ) => void,
): ChatOnFinishCallback<WorkflowUIMessage> {
  return ({ isAbort, isError, message, finishReason }) => {
    const terminal = terminalForFinish({
      error: latestErrorRef.current,
      finishReason,
      isAbort,
      isError,
      message,
    });
    setTerminal(terminal);
    onFinish?.(terminal, message, latestErrorRef.current);
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
