import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { Effect, Stream } from "effect";
import type { ModelProvider } from "#providers/model-provider";
import { createScriptedLanguageModel } from "#testing/scripted-language-model";
import {
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type RuntimeEvent,
} from "#runtime/contract/runtime-event";
import type { AgentExecutionRequest, AgentExecutor } from "#runtime/agent-runtime";

export const createCapturingProvider = (
  modelCalls: LanguageModelV3CallOptions[],
): ModelProvider => ({
  providerId: "capture",
  modelIds: ["capture-model"],
  resolveModel: (selection) =>
    Effect.succeed(
      createScriptedLanguageModel({
        providerId: "capture",
        modelId: selection.modelId,
        text: "Captured response.",
        onStreamCall: (options) => modelCalls.push(options),
      }),
    ),
});

export const createThrowingProvider = (): ModelProvider => ({
  providerId: "throwing",
  modelIds: ["throwing-model"],
  resolveModel: () => {
    throw new Error("provider adapter exploded");
  },
});

export const createDeterministicExecutor = (
  executorId: string,
  calls: AgentExecutionRequest[] = [],
): AgentExecutor => ({
  executorId,
  description: "Deterministic fixture executor.",
  stream: (executionRequest) => {
    calls.push(executionRequest);
    const { requestId, assistantTurnId, providerId, modelId } = executionRequest.providerRequest;
    const events = [
      {
        type: RUNTIME_EVENT_TYPES.STARTED,
        requestId,
        assistantTurnId,
        sequence: 0,
        providerId,
        modelId,
      },
      {
        type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
        requestId,
        assistantTurnId,
        sequence: 1,
        content: `executor:${executorId}`,
      },
      {
        type: RUNTIME_EVENT_TYPES.COMPLETED,
        requestId,
        assistantTurnId,
        sequence: 2,
        finishReason: RUNTIME_FINISH_REASONS.STOP,
      },
    ] satisfies readonly RuntimeEvent[];

    return Stream.fromIterable(events);
  },
});

export const collectEvents = async <T>(events: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};
