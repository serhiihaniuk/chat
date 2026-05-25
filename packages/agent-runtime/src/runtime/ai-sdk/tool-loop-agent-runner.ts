import {
  ToolLoopAgent as AiSdkToolLoopAgent,
  type LanguageModel,
  type LanguageModelUsage,
  type TextStreamPart,
  type ToolLoopAgentSettings,
  type ToolSet,
} from "ai";

import type { RuntimeEvent, RuntimeUsage } from "../contract/runtime-event.js";
import type { RuntimeProviderRequest } from "../contract/runtime-request.js";
import {
  createAiSdkToolSet,
  createRuntimeToolLookup,
  mapAiSdkToolActivity,
} from "./ai-sdk-tool-adapter.js";

/**
 * Private adapter around AI SDK ToolLoopAgent.
 *
 * This file is the only place that runs the AI SDK agent loop. Everything it
 * yields is normalized into RuntimeEvent before leaving agent-runtime.
 */
export type AiSdkToolLoopAgentRunOptions = {
  readonly model: LanguageModel;
  readonly providerOptions?: ToolLoopAgentSettings["providerOptions"] | undefined;
  readonly request: RuntimeProviderRequest;
};

export const runAiSdkToolLoopAgent = ({
  model,
  providerOptions,
  request,
}: AiSdkToolLoopAgentRunOptions): AsyncIterable<RuntimeEvent> =>
  streamAiSdkToolLoop({
    model,
    providerOptions,
    request,
  });

async function* streamAiSdkToolLoop({
  model,
  providerOptions,
  request,
}: AiSdkToolLoopAgentRunOptions): AsyncIterable<RuntimeEvent> {
  let sequence = 0;
  yield {
    type: "runtime.started",
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence,
    providerId: request.providerId,
    modelId: request.modelId,
  };
  sequence += 1;

  const tools = createAiSdkToolSet(request.tools, request);
  const runtimeTools = createRuntimeToolLookup(request.tools);
  const agent = new AiSdkToolLoopAgent({
    model,
    allowSystemInMessages: true,
    maxRetries: 0,
    ...(tools ? { tools, toolChoice: "auto" as const } : {}),
    ...(providerOptions ? { providerOptions } : {}),
  });
  const result = await agent.stream({
    messages: [...request.messages],
    ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
  });

  const reasoningState: ReasoningStreamState = {
    blockIndex: 0,
    text: "",
  };
  const flushReasoning = (): RuntimeEvent | undefined => {
    const event = createReasoningActivity(request, sequence, reasoningState, "completed");
    if (event) {
      sequence += 1;
      reasoningState.blockIndex += 1;
      reasoningState.text = "";
    }
    return event;
  };

  for await (const part of result.fullStream) {
    if (part.type === "reasoning-delta") {
      reasoningState.text = `${reasoningState.text}${part.text}`;
      const event = createReasoningActivity(request, sequence, reasoningState, "running");
      if (event) {
        yield event;
        sequence += 1;
      }
      continue;
    }

    const reasoningEvent = flushReasoning();
    if (reasoningEvent) yield reasoningEvent;

    const toolEvent = mapAiSdkToolActivity(request, part, sequence, runtimeTools);
    if (toolEvent) {
      yield toolEvent;
      sequence += 1;
      continue;
    }

    const event = mapAiSdkStreamPart(request, part, sequence);
    if (!event) continue;
    yield event;
    sequence += 1;
  }

  const reasoningEvent = flushReasoning();
  if (reasoningEvent) yield reasoningEvent;
}

const mapAiSdkStreamPart = (
  request: RuntimeProviderRequest,
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
      message: part.error instanceof Error ? part.error.message : "AI SDK agent stream failed.",
      retryable: true,
    };
  }
  return undefined;
};

const createReasoningActivity = (
  request: RuntimeProviderRequest,
  sequence: number,
  state: ReasoningStreamState,
  status: "running" | "completed",
): RuntimeEvent | undefined => {
  const presentation = toReasoningPresentation(state.text);
  if (!presentation) return undefined;

  return {
    type: "runtime.activity",
    activityId: `reasoning-${request.assistantTurnId}-${state.blockIndex}`,
    activityKind: "reasoning",
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence,
    status,
    title: presentation.title,
    ...(presentation.body ? { body: presentation.body } : {}),
  };
};

type ReasoningStreamState = {
  blockIndex: number;
  text: string;
};

const toReasoningPresentation = (
  reasoningText: string,
): { readonly title: string; readonly body?: string } | undefined => {
  const normalized = reasoningText.replace(/\s+/gu, " ").trim();
  if (!normalized) return undefined;

  const titledContent = /^\*\*(?<title>[^*]+)\*\*\s*(?<body>.*)$/su.exec(normalized);
  const title = stripInlineMarkdown(titledContent?.groups?.["title"] ?? "");
  const body = titledContent?.groups?.["body"]?.trim();
  if (title) return { title, ...(body ? { body } : {}) };

  const fallbackTitle = stripInlineMarkdown(normalized).replace(/\*/gu, "").trim();
  return {
    title: fallbackTitle && normalized.length <= 120 ? fallbackTitle : "Thinking",
  };
};

const stripInlineMarkdown = (value: string): string =>
  value
    .replace(/\*\*(?<content>[^*]+)\*\*/gu, "$<content>")
    .replace(/[_`]/gu, "")
    .trim();

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
