import {
  SIDE_CHAT_ERROR_VOCABULARY,
  SIDE_CHAT_MESSAGE_TERMINAL_STATUSES,
  type SideChatFinishReason,
} from "@side-chat/stream-profile";

import type { WorkflowUIMessage } from "#entities/workflow-chat";

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

/** Rebuild the terminal presentation from validated durable message metadata. */
export function workflowChatTerminalFromMessage(
  message: WorkflowUIMessage,
): Exclude<WorkflowChatTerminal, { kind: "none" }> | undefined {
  const terminal = message.metadata?.terminal;
  if (terminal === undefined) return undefined;
  const base = { messageId: message.id, partCount: message.parts.length };
  if (terminal.status === SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.COMPLETED) {
    return { kind: "completed", finishReason: terminal.finishReason, ...base };
  }
  if (terminal.status === SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.CANCELLED) {
    return { kind: "cancelled", ...base };
  }
  const profile = SIDE_CHAT_ERROR_VOCABULARY[terminal.errorCode];
  return {
    kind: "error",
    code: terminal.errorCode,
    message: profile.safeMessage,
    retryable: profile.retryable,
    ...base,
  };
}

export function workflowChatTerminalFromHistory(
  messages: readonly WorkflowUIMessage[],
): WorkflowChatTerminal {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    const terminal = workflowChatTerminalFromMessage(message);
    if (terminal !== undefined) return terminal;
  }
  return { kind: "none" };
}
