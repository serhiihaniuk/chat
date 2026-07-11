import type { WorkflowAgentStreamResult } from "@ai-sdk/workflow";
import type { UIMessage } from "ai";

export const CHAT_TURN_OUTCOMES = {
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;

export const CHAT_TURN_ERROR_CODES = {
  MODEL_STREAM_FAILED: "model_stream_failed",
  PROVIDER_TIMEOUT: "provider_timeout",
} as const;

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

type WorkflowAgentContentPart =
  WorkflowAgentStreamResult["steps"][number]["content"][number];

type CompletedAgentResult = Readonly<{
  steps: readonly Readonly<{ content: readonly WorkflowAgentContentPart[] }>[];
  finishReason: string;
  totalUsage: Readonly<{
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
    inputTokenDetails?:
      | Readonly<{ cacheReadTokens: number | undefined }>
      | undefined;
    outputTokenDetails?:
      | Readonly<{ reasoningTokens: number | undefined }>
      | undefined;
  }>;
}>;

export function toCompletedChatTurnOutcome(
  turnId: string,
  maxSteps: number,
  result: CompletedAgentResult,
): ChatTurnTerminalOutcome {
  return {
    status: CHAT_TURN_OUTCOMES.COMPLETED,
    assistantMessage: toAssistantMessage(turnId, result),
    finishReason: finishReasonFor(result, maxSteps),
    usage: {
      inputTokens: result.totalUsage.inputTokens,
      outputTokens: result.totalUsage.outputTokens,
      totalTokens: result.totalUsage.totalTokens,
      reasoningTokens: result.totalUsage.outputTokenDetails?.reasoningTokens,
      cachedInputTokens: result.totalUsage.inputTokenDetails?.cacheReadTokens,
    },
  };
}

export function failedChatTurnOutcome(error: unknown): ChatTurnTerminalOutcome {
  if (error instanceof DOMException && error.name === "AbortError") {
    if (error.message === CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT) {
      return {
        status: CHAT_TURN_OUTCOMES.FAILED,
        code: CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT,
      };
    }
    return { status: CHAT_TURN_OUTCOMES.CANCELLED, reason: error.message };
  }
  return {
    status: CHAT_TURN_OUTCOMES.FAILED,
    code: CHAT_TURN_ERROR_CODES.MODEL_STREAM_FAILED,
  };
}

function toAssistantMessage(
  turnId: string,
  result: CompletedAgentResult,
): UIMessage {
  const content = result.steps.at(-1)?.content ?? [];
  const parts: UIMessage["parts"] = [];
  for (const part of content) {
    if (part.type === "text") parts.push({ type: "text", text: part.text });
    if (part.type === "reasoning")
      parts.push({ type: "reasoning", text: part.text });
  }
  return {
    id: `${turnId}-assistant`,
    role: "assistant",
    parts,
  };
}

function finishReasonFor(
  result: CompletedAgentResult,
  maxSteps: number,
): string {
  const stoppedAtStepLimit =
    result.finishReason === "tool-calls" && result.steps.length >= maxSteps;
  return stoppedAtStepLimit ? "length" : result.finishReason;
}
