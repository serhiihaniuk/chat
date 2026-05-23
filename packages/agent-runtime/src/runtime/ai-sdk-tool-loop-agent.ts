import {
  ToolLoopAgent as AiSdkToolLoopAgent,
  type LanguageModel,
  type LanguageModelUsage,
  type TextStreamPart,
  type ToolSet,
} from "ai";

import type { RuntimeEvent, RuntimeUsage } from "../events.js";
import type { RuntimeRequest } from "../provider.js";

export type AiSdkModelResolver = (request: RuntimeRequest) => LanguageModel;
export type AiSdkToolLoopAgentOptions = {
  readonly resolveModel: AiSdkModelResolver;
};

export type AiSdkRuntimeAgent = {
  readonly stream: (request: RuntimeRequest) => AsyncIterable<RuntimeEvent>;
};

export const createAiSdkToolLoopAgent = (
  resolveModel: (request: RuntimeRequest) => LanguageModel,
): AiSdkRuntimeAgent => ({
  async *stream(request) {
    let sequence = 0;
    yield {
      type: "runtime.started",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      providerId: request.providerId ?? "ai-sdk",
      modelId: request.modelId,
    };
    sequence += 1;

    const agent = new AiSdkToolLoopAgent({
      model: resolveModel(request),
      allowSystemInMessages: true,
      maxRetries: 0,
    });
    const result = await agent.stream({
      messages: [...request.messages],
    });

    for await (const part of result.fullStream) {
      const event = mapAiSdkStreamPart(request, part, sequence);
      if (!event) continue;
      yield event;
      sequence += 1;
    }
  },
});

const mapAiSdkStreamPart = (
  request: RuntimeRequest,
  part: TextStreamPart<ToolSet>,
  sequence: number,
): RuntimeEvent | undefined => {
  if (part.type === "text-delta") {
    return {
      type: "runtime.output_delta",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      content: part.text,
    };
  }
  if (part.type === "reasoning-delta") {
    return {
      type: "runtime.reasoning",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      summary: part.text,
    };
  }
  if (part.type === "finish") {
    return {
      type: "runtime.completed",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      finishReason: mapFinishReason(part.finishReason),
      usage: toRuntimeUsage(part.totalUsage),
    };
  }
  if (part.type === "error") {
    return {
      type: "runtime.error",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      code: "provider_unavailable",
      message:
        part.error instanceof Error
          ? part.error.message
          : "AI SDK agent stream failed.",
      retryable: true,
    };
  }
  return undefined;
};

const mapFinishReason = (reason: string): "stop" | "length" | "aborted" => {
  if (reason === "length") return "length";
  if (reason === "abort" || reason === "content-filter") return "aborted";
  return "stop";
};

const toRuntimeUsage = (usage: LanguageModelUsage): RuntimeUsage => ({
  inputTokens: usage.inputTokens ?? 0,
  outputTokens: usage.outputTokens ?? 0,
  totalTokens: usage.totalTokens ?? 0,
});
