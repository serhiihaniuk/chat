import type { SideChatErrorCode } from "../error-vocabulary.js";
import type { SideChatFinishReason } from "../finish-reasons.js";

export const SIDE_CHAT_MESSAGE_TERMINAL_STATUSES = {
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;

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
