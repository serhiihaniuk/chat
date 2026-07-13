import type { WorkflowAgentStreamResult } from "@ai-sdk/workflow";
import type { UIMessage } from "ai";

import {
  TURN_EXECUTION_ERROR_CODES,
  TURN_TERMINAL_STATUSES,
  ZERO_TURN_USAGE,
  type TurnExecutionErrorCode,
  type TurnTerminal,
  type TurnTerminalStatus,
  type TurnUsage,
} from "#domain/turn/turn";

export const CHAT_TURN_OUTCOMES = {
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;

export const CHAT_TURN_ERROR_CODES = {
  MODEL_STREAM_FAILED: "model_stream_failed",
  PROVIDER_TIMEOUT: "provider_timeout",
} as const;

/** Native provider finish reason that marks content-filtered ("blocked") output. */
const CONTENT_FILTER_FINISH_REASON = "content-filter";

/** Abort rejections must carry this `Error.name` or the engine retries the step. */
export const ABORT_ERROR_NAME = "AbortError";

interface SerializableUsage {
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
  readonly totalTokens: number | undefined;
  readonly reasoningTokens: number | undefined;
  readonly cachedInputTokens: number | undefined;
}

export type ChatTurnTerminalOutcome =
  | {
      readonly status: typeof CHAT_TURN_OUTCOMES.COMPLETED;
      readonly assistantMessage: UIMessage;
      readonly finishReason: string;
      readonly activityDurationMs: number;
      readonly usage: SerializableUsage;
    }
  | {
      readonly status: typeof CHAT_TURN_OUTCOMES.CANCELLED;
      readonly reason: string;
    }
  | {
      readonly status: typeof CHAT_TURN_OUTCOMES.FAILED;
      readonly code:
        | typeof CHAT_TURN_ERROR_CODES.MODEL_STREAM_FAILED
        | typeof CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT;
    };

/**
 * The single decision that keeps the route terminal and the durable claim in
 * agreement: which durable status a workflow outcome maps to, and whether it
 * carries an assistant message. A `content-filter` completion is `blocked` with no
 * message; a cancel or a failure carries none either.
 */
export type ChatTurnClassification = Readonly<{
  status: TurnTerminalStatus;
  finishReason?: string;
  activityDurationMs?: number;
  safeErrorCode?: TurnExecutionErrorCode;
  assistantMessage?: UIMessage;
}>;

/** The durable-write payload derived from a classification and folded usage. */
export type ChatTurnFinalization = Readonly<{
  terminal: TurnTerminal;
  assistantMessage?: UIMessage;
}>;

type WorkflowAgentContentPart = WorkflowAgentStreamResult["steps"][number]["content"][number];

type CompletedAgentResult = Readonly<{
  steps: readonly Readonly<{ content: readonly WorkflowAgentContentPart[] }>[];
  finishReason: string;
  totalUsage: Readonly<{
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
    inputTokenDetails?: Readonly<{ cacheReadTokens: number | undefined }> | undefined;
    outputTokenDetails?: Readonly<{ reasoningTokens: number | undefined }> | undefined;
  }>;
}>;

export function toCompletedChatTurnOutcome(
  turnId: string,
  maxSteps: number,
  activityDurationMs: number,
  result: CompletedAgentResult,
): ChatTurnTerminalOutcome {
  return {
    status: CHAT_TURN_OUTCOMES.COMPLETED,
    assistantMessage: toAssistantMessage(turnId, result),
    finishReason: finishReasonFor(result, maxSteps),
    activityDurationMs,
    usage: {
      inputTokens: result.totalUsage.inputTokens,
      outputTokens: result.totalUsage.outputTokens,
      totalTokens: result.totalUsage.totalTokens,
      reasoningTokens: result.totalUsage.outputTokenDetails?.reasoningTokens,
      cachedInputTokens: result.totalUsage.inputTokenDetails?.cacheReadTokens,
    },
  };
}

/**
 * A non-abort stream rejection is always a safe, opaque model failure. Cancel and
 * timeout are never classified here: they are decided by construction in the
 * explicit race arms, so an aborted stream defers rather than reaching this path.
 */
export function failedChatTurnOutcome(): ChatTurnTerminalOutcome {
  return {
    status: CHAT_TURN_OUTCOMES.FAILED,
    code: CHAT_TURN_ERROR_CODES.MODEL_STREAM_FAILED,
  };
}

/** True for the durable abort rejection our cancel/timeout paths raise. */
export function isChatTurnAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === ABORT_ERROR_NAME;
}

/** The single source both the route terminal and the durable claim derive from. */
export function classifyChatTurnOutcome(outcome: ChatTurnTerminalOutcome): ChatTurnClassification {
  if (outcome.status === CHAT_TURN_OUTCOMES.COMPLETED) {
    if (outcome.finishReason === CONTENT_FILTER_FINISH_REASON) {
      return {
        status: TURN_TERMINAL_STATUSES.BLOCKED,
        finishReason: outcome.finishReason,
        activityDurationMs: outcome.activityDurationMs,
      };
    }
    return {
      status: TURN_TERMINAL_STATUSES.COMPLETED,
      finishReason: outcome.finishReason,
      activityDurationMs: outcome.activityDurationMs,
      assistantMessage: withUsageMetadata(
        outcome.assistantMessage,
        chatTurnUsage(outcome),
        outcome.activityDurationMs,
      ),
    };
  }
  if (outcome.status === CHAT_TURN_OUTCOMES.CANCELLED) {
    return { status: TURN_TERMINAL_STATUSES.CANCELLED };
  }
  return {
    status: TURN_TERMINAL_STATUSES.FAILED,
    safeErrorCode: toTurnExecutionErrorCode(outcome.code),
  };
}

/** Fold the outcome's aggregate usage into the domain shape; zero unless completed. */
export function chatTurnUsage(outcome: ChatTurnTerminalOutcome): TurnUsage {
  if (outcome.status !== CHAT_TURN_OUTCOMES.COMPLETED) return ZERO_TURN_USAGE;
  const inputTokens = outcome.usage.inputTokens ?? 0;
  const outputTokens = outcome.usage.outputTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: outcome.usage.totalTokens ?? inputTokens + outputTokens,
    reasoningTokens: outcome.usage.reasoningTokens ?? 0,
    cachedInputTokens: outcome.usage.cachedInputTokens ?? 0,
  };
}

/** Build the durable-write payload the workflow finalize step persists. */
export function chatTurnFinalization(outcome: ChatTurnTerminalOutcome): ChatTurnFinalization {
  const classification = classifyChatTurnOutcome(outcome);
  const terminal: TurnTerminal = {
    status: classification.status,
    usage: chatTurnUsage(outcome),
    ...(classification.safeErrorCode === undefined
      ? {}
      : { safeErrorCode: classification.safeErrorCode }),
    ...(classification.finishReason === undefined
      ? {}
      : { finishReason: classification.finishReason }),
  };
  return classification.assistantMessage === undefined
    ? { terminal }
    : { terminal, assistantMessage: classification.assistantMessage };
}

function withUsageMetadata(
  message: UIMessage,
  usage: TurnUsage,
  activityDurationMs: number,
): UIMessage {
  return { ...message, metadata: { usage, activityDurationMs } };
}

function toTurnExecutionErrorCode(
  code: (typeof CHAT_TURN_ERROR_CODES)[keyof typeof CHAT_TURN_ERROR_CODES],
): TurnExecutionErrorCode {
  if (code === CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT) {
    return TURN_EXECUTION_ERROR_CODES.PROVIDER_TIMEOUT;
  }
  return TURN_EXECUTION_ERROR_CODES.MODEL_STREAM_FAILED;
}

function toAssistantMessage(turnId: string, result: CompletedAgentResult): UIMessage {
  const content = result.steps.at(-1)?.content ?? [];
  const parts: UIMessage["parts"] = [];
  for (const part of content) {
    if (part.type === "text") parts.push({ type: "text", text: part.text });
    if (part.type === "reasoning") parts.push({ type: "reasoning", text: part.text });
  }
  return {
    id: `${turnId}-assistant`,
    role: "assistant",
    parts,
  };
}

function finishReasonFor(result: CompletedAgentResult, maxSteps: number): string {
  const stoppedAtStepLimit =
    result.finishReason === "tool-calls" && result.steps.length >= maxSteps;
  return stoppedAtStepLimit ? "length" : result.finishReason;
}
