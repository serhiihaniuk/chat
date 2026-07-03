import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { Effect, Stream } from "effect";
import {
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import type { ModelProvider } from "#providers/model-provider";
import { createScriptedLanguageModel } from "#testing/scripted-language-model";
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

export const createContentFilterProvider = (): ModelProvider => ({
  providerId: "content-filter",
  modelIds: ["content-filter-model"],
  resolveModel: (selection) =>
    Effect.succeed(
      createScriptedLanguageModel({
        providerId: "content-filter",
        modelId: selection.modelId,
        text: "partial answer before the filter stop",
        finishReason: "content-filter",
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

const ZERO_V3_USAGE: LanguageModelV3Usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

/**
 * A provider whose stream emits an in-band `error` part and then an errored
 * `finish` — the double-terminal repro.
 *
 * Before this story the error mapped to `runtime.error` and the errored finish
 * mapped to a second `runtime.completed(stop)`. The runner now ends at the first
 * terminal, so exactly one `runtime.error` survives.
 */
export const createErrorThenFinishProvider = (): ModelProvider => ({
  providerId: "error-finish",
  modelIds: ["error-finish-model"],
  resolveModel: (selection) => Effect.succeed(createErrorThenFinishModel(selection.modelId)),
});

const createErrorThenFinishModel = (modelId: string): LanguageModelV3 => ({
  specificationVersion: "v3",
  provider: "error-finish",
  modelId,
  supportedUrls: {},
  doGenerate: () => Promise.reject(new Error("error-finish fixture is stream-only")),
  doStream: () =>
    Promise.resolve({
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "text_1" });
          controller.enqueue({ type: "text-delta", id: "text_1", delta: "partial answer" });
          controller.enqueue({ type: "text-end", id: "text_1" });
          controller.enqueue({ type: "error", error: new Error("provider stream blew up") });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "error", raw: "error" },
            usage: ZERO_V3_USAGE,
          });
          controller.close();
        },
      }),
    }),
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
