import type { SideChatErrorCode } from "../error-vocabulary.js";
import type { SideChatFinishReason } from "../finish-reasons.js";

export const SIDE_CHAT_MESSAGE_TERMINAL_STATUSES = {
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;

/**
 * Target shape for service terminal outcomes carried to browser message metadata.
 *
 * Callers receive only the closed finish/error vocabulary. Provider exceptions,
 * tool payloads, prompts, and persistence details remain hidden in their owners.
 */
export type SideChatMessageTerminal =
  | Readonly<{
      status: typeof SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.COMPLETED;
      finishReason?: SideChatFinishReason | undefined;
    }>
  | Readonly<{ status: typeof SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.CANCELLED }>
  | Readonly<{
      status: typeof SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.FAILED;
      errorCode: SideChatErrorCode;
    }>;
