import {
  ToolLoopAgent as AiSdkToolLoopAgent,
  type LanguageModel,
  type ToolLoopAgentSettings,
} from "ai";

import type { RuntimeEvent } from "../contract/runtime-event.js";
import type { RuntimeProviderRequest } from "../contract/runtime-request.js";
import { createAiSdkToolSet } from "./ai-sdk-tool-adapter.js";
import {
  appendReasoningDelta,
  createReasoningStreamState,
  flushReasoningActivity,
} from "./reasoning-activity.js";
import { createRuntimeStartedEvent, mapAiSdkStreamPart } from "./stream-part-mapper.js";
import { createRuntimeToolLookup, mapAiSdkToolActivity } from "./tool-activity-mapper.js";

/**
 * Run one already-prepared request through AI SDK ToolLoopAgent.
 *
 * `turn/prepare-runtime-turn.ts` already selected provider/model, tools, and
 * messages. This file does not decide policy; it only runs the AI SDK stream
 * and yields normalized RuntimeEvent values in sequence order.
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
  /**
   * Sequence is assigned at the adapter boundary, not by individual mappers.
   *
   * AI SDK yields different part types from one stream. Keeping the counter in
   * this loop guarantees that text, reasoning, tool activity, errors, and the
   * final completion share one chronological order.
   */
  let sequence = 0;
  yield createRuntimeStartedEvent(request, sequence);
  sequence += 1;

  const tools = createAiSdkToolSet(request.tools, request);
  const runtimeTools = createRuntimeToolLookup(request.tools);

  /**
   * AI SDK receives system messages from runtime prompt rendering.
   *
   * `toolChoice: "auto"` is intentional: the runtime exposes capabilities, but
   * the model chooses if/when to call them. The backend must not pre-run tools
   * because that would fake activity before the agent acts.
   */
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

  const reasoningState = createReasoningStreamState();
  const flushReasoning = (): RuntimeEvent | undefined => {
    const event = flushReasoningActivity(request, reasoningState, sequence);
    if (event) sequence += 1;
    return event;
  };

  for await (const part of result.fullStream) {
    /**
     * Reasoning arrives as deltas, but downstream UI wants one activity row.
     *
     * We update the same reasoning activity while deltas arrive, then mark it
     * completed before emitting any normal text/tool/completion event.
     */
    if (part.type === "reasoning-delta") {
      const event = appendReasoningDelta(request, reasoningState, part.text, sequence);
      if (event) {
        yield event;
        sequence += 1;
      }
      continue;
    }

    const reasoningEvent = flushReasoning();
    if (reasoningEvent) yield reasoningEvent;

    /**
     * Tool parts are observed as stream parts, not as separate backend actions.
     *
     * The tool adapter executes the selected RuntimeTool through AI SDK. Here
     * we only map the observed input/result/error parts to one activity row.
     */
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
