export const TURN_TERMINAL_STATUSES = {
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type TurnTerminalStatus =
  (typeof TURN_TERMINAL_STATUSES)[keyof typeof TURN_TERMINAL_STATUSES];

export const TURN_EXECUTION_ERROR_CODES = {
  MODEL_STREAM_FAILED: "model_stream_failed",
  PROVIDER_TIMEOUT: "provider_timeout",
  WORKFLOW_FAILED: "workflow_failed",
} as const;

export type TurnExecutionErrorCode =
  (typeof TURN_EXECUTION_ERROR_CODES)[keyof typeof TURN_EXECUTION_ERROR_CODES];

export const TURN_MESSAGE_ROLES = {
  USER: "user",
  ASSISTANT: "assistant",
} as const;

export type TurnMessageRole = (typeof TURN_MESSAGE_ROLES)[keyof typeof TURN_MESSAGE_ROLES];

/** Application-owned conversation content. SDK message parts stay in runtime adapters. */
export type TurnMessage = Readonly<{
  id: string;
  role: TurnMessageRole;
  text: string;
}>;

export const TURN_OUTPUT_EVENT_TYPES = {
  START: "start",
  TEXT_START: "text_start",
  TEXT_DELTA: "text_delta",
  TEXT_END: "text_end",
  ERROR: "error",
  ABORT: "abort",
  FINISH: "finish",
} as const;

export const TURN_FINISH_REASONS = {
  STOP: "stop",
} as const;

export type TurnOutputEvent =
  | Readonly<{ type: typeof TURN_OUTPUT_EVENT_TYPES.START; messageId: string }>
  | Readonly<{
      type: typeof TURN_OUTPUT_EVENT_TYPES.TEXT_START;
      textId: string;
    }>
  | Readonly<{
      type: typeof TURN_OUTPUT_EVENT_TYPES.TEXT_DELTA;
      textId: string;
      delta: string;
    }>
  | Readonly<{ type: typeof TURN_OUTPUT_EVENT_TYPES.TEXT_END; textId: string }>
  | Readonly<{
      type: typeof TURN_OUTPUT_EVENT_TYPES.ERROR;
      errorCode: TurnExecutionErrorCode;
    }>
  | Readonly<{ type: typeof TURN_OUTPUT_EVENT_TYPES.ABORT }>
  | Readonly<{ type: typeof TURN_OUTPUT_EVENT_TYPES.FINISH }>;

export type TurnRef = Readonly<{
  conversationId: string;
  turnId: string;
}>;

export type TurnUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}>;

export type TurnTerminal = Readonly<{
  status: TurnTerminalStatus;
  usage: TurnUsage;
  safeErrorCode?: TurnExecutionErrorCode | undefined;
}>;

export const ZERO_TURN_USAGE: TurnUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

export function sumTurnUsage(steps: readonly TurnUsage[]): TurnUsage {
  return steps.reduce<TurnUsage>(
    (total, step) => ({
      inputTokens: total.inputTokens + step.inputTokens,
      outputTokens: total.outputTokens + step.outputTokens,
      totalTokens: total.totalTokens + step.totalTokens,
    }),
    ZERO_TURN_USAGE,
  );
}
