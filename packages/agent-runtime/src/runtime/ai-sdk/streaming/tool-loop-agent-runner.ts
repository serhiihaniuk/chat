import {
  ToolLoopAgent as AiSdkToolLoopAgent,
  type LanguageModel,
  type TextStreamPart,
  type ToolLoopAgentSettings,
  type ToolSet,
} from "ai";
import { Effect, Stream } from "effect";

import { AgentRuntimeError } from "../../contract/runtime-error.js";
import { RUNTIME_ERROR_CODES, type RuntimeEvent } from "../../contract/runtime-event.js";
import type { RuntimeProviderRequest } from "../../contract/runtime-request.js";
import type { RuntimeEventStream } from "../../contract/runtime-stream.js";
import type { RuntimeTool } from "#tools/runtime-tool";
import { createAiSdkToolSet } from "../tools/ai-sdk-tool-adapter.js";
import {
  appendReasoningDelta,
  createReasoningStreamState,
  flushReasoningActivity,
  type ReasoningStreamState,
} from "./reasoning-activity.js";
import { createRuntimeStartedEvent, mapAiSdkStreamPart } from "./stream-part-mapper.js";
import { createRuntimeToolLookup, mapAiSdkToolActivity } from "./tool-activity-mapper.js";

/**
 * Stable trace span for the moment AI SDK opens the provider/tool-loop stream.
 *
 * Target is stream setup, not full response generation. Individual
 * runtime events still arrive later through `result.fullStream`.
 */
const AI_SDK_AGENT_STREAM_OPEN_SPAN = "agent-runtime.ai-sdk.open-stream" as const;
const AI_SDK_TOOL_CHOICE_AUTO = "auto" as const;

/**
 * Run one already-prepared request through AI SDK ToolLoopAgent.
 *
 * Source `turn/prepare-runtime-turn.ts` already selected provider/model, tools, and
 * messages. This file does not decide policy; it only runs the AI SDK stream
 * and yields normalized RuntimeEvent values in sequence order.
 */
export type AiSdkToolLoopAgentRunOptions = {
  readonly model: LanguageModel;
  readonly providerOptions?: ToolLoopAgentSettings["providerOptions"] | undefined;
  readonly request: RuntimeProviderRequest;
};

/**
 * Run AI SDK ToolLoopAgent as an Effect Stream.
 *
 * Invariant: this is the only runtime path. Provider startup, stream errors, interruption,
 * and future tracing/retry policy all belong in this Stream pipeline.
 */
export const runAiSdkToolLoopAgentStream = ({
  model,
  providerOptions,
  request,
}: AiSdkToolLoopAgentRunOptions): RuntimeEventStream => {
  /**
   * Sequence is assigned at the adapter boundary, not by individual mappers.
   *
   * AI SDK yields different part types from one stream. Keeping the counter in
   * this loop guarantees that text, reasoning, tool activity, errors, and the
   * final completion share one chronological order.
   */
  const started = Stream.succeed(createRuntimeStartedEvent(request, 0));
  return Stream.concat(started, createAiSdkRuntimeEventStream({ model, providerOptions, request }));
};

const createAiSdkRuntimeEventStream = ({
  model,
  providerOptions,
  request,
}: AiSdkToolLoopAgentRunOptions): RuntimeEventStream => {
  const openedParts = createAiSdkPartStream({ model, providerOptions, request });
  const mappedEvents = Effect.map(openedParts, (parts) =>
    mapAiSdkPartsToRuntimeEventStream(request, parts),
  );
  return Stream.unwrap(mappedEvents);
};

const mapAiSdkPartsToRuntimeEventStream = (
  request: RuntimeProviderRequest,
  parts: AsyncIterable<TextStreamPart<ToolSet>>,
): RuntimeEventStream =>
  Stream.fromAsyncIterable(parts, toRuntimeError).pipe(
    Stream.mapAccum(
      () => createRuntimeEventMappingState(request.tools),
      (state, part) => mapAiSdkPartToRuntimeEvents(request, state, part),
      {
        onHalt: (state) => flushReasoningOnStreamEnd(request, state),
      },
    ),
  );

const createAiSdkPartStream = ({
  model,
  providerOptions,
  request,
}: AiSdkToolLoopAgentRunOptions): Effect.Effect<
  AsyncIterable<TextStreamPart<ToolSet>>,
  AgentRuntimeError
> =>
  Effect.tryPromise({
    try: async () => {
      const tools = createAiSdkToolSet(request.tools, request);

      /**
       * AI SDK receives system messages from runtime prompt rendering.
       *
       * `toolChoice: "auto"` is intentional: the runtime exposes capabilities,
       * but the model chooses if/when to call them. The backend must not pre-run
       * tools because that would fake activity before the agent acts.
       */
      const agent = new AiSdkToolLoopAgent({
        model,
        allowSystemInMessages: true,
        maxRetries: 0,
        ...(tools ? { tools, toolChoice: AI_SDK_TOOL_CHOICE_AUTO } : {}),
        ...(providerOptions ? { providerOptions } : {}),
      });

      /**
       * `agent.stream` returns the stream handle; it does not buffer the answer.
       *
       * Awaiting here only waits for AI SDK to open the provider/tool-loop
       * stream. The caller still receives `result.fullStream` as a lazy
       * AsyncIterable, and Effect consumes each provider part as it arrives.
       */
      const result = await agent.stream({
        messages: [...request.messages],
        ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
      });
      return result.fullStream;
    },
    catch: (error) => toRuntimeError(error),
  }).pipe(
    Effect.withSpan(AI_SDK_AGENT_STREAM_OPEN_SPAN, {
      attributes: {
        providerId: request.providerId,
        modelId: request.modelId,
        requestId: request.requestId,
        assistantTurnId: request.assistantTurnId,
      },
    }),
  );

type RuntimeEventMappingState = {
  readonly sequence: number;
  readonly reasoningState: ReasoningStreamState;
  readonly runtimeTools: ReadonlyMap<string, RuntimeTool>;
};

const createRuntimeEventMappingState = (
  runtimeTools: RuntimeProviderRequest["tools"],
): RuntimeEventMappingState => ({
  sequence: 1,
  reasoningState: createReasoningStreamState(),
  runtimeTools: createRuntimeToolLookup(runtimeTools),
});

const mapAiSdkPartToRuntimeEvents = (
  request: RuntimeProviderRequest,
  state: RuntimeEventMappingState,
  part: TextStreamPart<ToolSet>,
): readonly [RuntimeEventMappingState, readonly RuntimeEvent[]] => {
  const next = createEventAppender(state);

  /**
   * Reasoning arrives as deltas, but downstream UI wants one activity row.
   *
   * We update the same reasoning activity while deltas arrive, then mark it
   * completed before emitting any normal text/tool/completion event.
   */
  if (part.type === "reasoning-delta") {
    next.append(appendReasoningDelta(request, state.reasoningState, part.text, state.sequence));
    return [next.state(), next.events];
  }

  next.append(flushReasoningActivity(request, state.reasoningState, state.sequence));

  /**
   * Tool parts are observed as stream parts, not as separate backend actions.
   *
   * The tool adapter executes the selected RuntimeTool through AI SDK. Here we
   * only map the observed input/result/error parts to one activity row.
   */
  const toolEvent = mapAiSdkToolActivity(request, part, next.sequence, state.runtimeTools);
  if (toolEvent) {
    next.append(toolEvent);
    return [next.state(), next.events];
  }

  next.append(mapAiSdkStreamPart(request, part, next.sequence));
  return [next.state(), next.events];
};

const flushReasoningOnStreamEnd = (
  request: RuntimeProviderRequest,
  state: RuntimeEventMappingState,
): readonly RuntimeEvent[] => {
  const event = flushReasoningActivity(request, state.reasoningState, state.sequence);
  return event ? [event] : [];
};

const createEventAppender = (state: RuntimeEventMappingState) => {
  const events: RuntimeEvent[] = [];
  let sequence = state.sequence;
  return {
    get sequence() {
      return sequence;
    },
    events,
    append(event: RuntimeEvent | undefined) {
      if (!event) return;
      events.push(event);
      sequence += 1;
    },
    state(): RuntimeEventMappingState {
      return { ...state, sequence };
    },
  };
};

const toRuntimeError = (error: unknown): AgentRuntimeError => {
  if (error instanceof AgentRuntimeError) return error;
  return new AgentRuntimeError(
    RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE,
    error instanceof Error ? error.message : "AI SDK agent stream failed.",
  );
};
