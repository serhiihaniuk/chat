import type { WorkflowAgentStreamResult } from "@ai-sdk/workflow";
import type { UIMessage } from "ai";

import { CHAT_TURN_OUTCOMES, type ChatTurnTerminalOutcome } from "./chat-turn-outcome.js";

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

/** Project the provider's final aggregate into terminal metadata and fallback content. */
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

function toAssistantMessage(turnId: string, result: CompletedAgentResult): UIMessage {
  const content = result.steps.at(-1)?.content ?? [];
  const parts: UIMessage["parts"] = [];
  for (const part of content) {
    if (part.type === "text") parts.push({ type: "text", text: part.text });
    if (part.type === "reasoning") {
      parts.push({ type: "reasoning", text: part.text });
    }
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
