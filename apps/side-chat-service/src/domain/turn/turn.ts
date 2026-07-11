export const TURN_TERMINAL_STATUSES = {
  COMPLETED: "completed",
  BLOCKED: "blocked",
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

export type TurnRef = Readonly<{
  conversationId: string;
  turnId: string;
}>;

export type TurnUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number | undefined;
  cachedInputTokens?: number | undefined;
}>;

export type TurnTerminal = Readonly<{
  status: TurnTerminalStatus;
  usage: TurnUsage;
  safeErrorCode?: TurnExecutionErrorCode | undefined;
  /**
   * The native provider finish reason (e.g. `stop`, `length`, `content-filter`).
   * Recorded verbatim so a content-filtered ("blocked") turn is distinguishable
   * in history from a clean stop; the wire carries the same value on its finish
   * part. Opaque string: the value set is owned by the provider, not by us.
   */
  finishReason?: string | undefined;
}>;

export const ZERO_TURN_USAGE: TurnUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
};

export function sumTurnUsage(steps: readonly TurnUsage[]): TurnUsage {
  return steps.reduce<TurnUsage>(
    (total, step) => ({
      inputTokens: total.inputTokens + step.inputTokens,
      outputTokens: total.outputTokens + step.outputTokens,
      totalTokens: total.totalTokens + step.totalTokens,
      reasoningTokens: (total.reasoningTokens ?? 0) + (step.reasoningTokens ?? 0),
      cachedInputTokens: (total.cachedInputTokens ?? 0) + (step.cachedInputTokens ?? 0),
    }),
    ZERO_TURN_USAGE,
  );
}
