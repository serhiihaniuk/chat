import {
  ToolLoopAgent as AiSdkToolLoopAgent,
  type LanguageModel,
  type TextStreamPart,
  type ToolLoopAgentSettings,
  type ToolSet,
} from "ai";
import { Effect, Stream } from "effect";
import { omitUndefinedProperties } from "@side-chat/shared";
import {
  isRuntimeTerminalEvent,
  type AiRuntimeError,
  type AiRuntimeEventStream,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import type { RuntimeProviderRequest } from "../../turn/runtime-provider-request.js";
import type { HostCommandResolver, RuntimeTool } from "#tools/runtime-tool";
import {
  agentCallSettings,
  createAiSdkToolSet,
  createHostCommandToolSet,
  hostCommandNameSet,
  mergeToolSets,
} from "../tools/ai-sdk-tool-adapter.js";
import {
  appendReasoningDelta,
  createReasoningStreamState,
  flushReasoningActivity,
  type ReasoningStreamState,
} from "./reasoning-activity.js";
import {
  classifyAiSdkPart,
  createRuntimeStartedEvent,
  mapAiSdkStreamPart,
  toRuntimeError,
} from "./stream-part-mapper.js";
import {
  coalesceTextDeltaParts,
  DEFAULT_OUTPUT_DELTA_FLUSH_MS,
} from "./coalescing/text-delta-coalescer.js";
import {
  createRuntimeToolLookup,
  isHostCommandToolPart,
  mapAiSdkHostCommandActivity,
  mapAiSdkToolActivity,
} from "./tool-activity-mapper.js";

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
 * The executor receives final model, message, and tool choices. This file opens
 * the AI SDK stream and emits RuntimeEvents in the same order.
 */
export type AiSdkToolLoopAgentRunOptions = {
  readonly model: LanguageModel;
  readonly providerOptions?: ToolLoopAgentSettings["providerOptions"] | undefined;
  readonly request: RuntimeProviderRequest;
  /** Text-batching window in ms; defaults to `DEFAULT_OUTPUT_DELTA_FLUSH_MS`, `0` disables. */
  readonly flushIntervalMs?: number | undefined;
  /** Awaits browser-side results for UI (host) tool calls; absent disables them. */
  readonly hostCommandResolver?: HostCommandResolver | undefined;
};

/**
 * Run AI SDK ToolLoopAgent as an Effect Stream.
 *
 * Invariant: this is the only runtime path. Provider startup, stream errors, interruption,
 * and future tracing/retry policy all belong in this Stream pipeline.
 */
export const runAiSdkToolLoopAgentStream = (
  options: AiSdkToolLoopAgentRunOptions,
): AiRuntimeEventStream => {
  /**
   * Assign sequence numbers in the stream loop, not inside each mapper.
   *
   * AI SDK yields many part types from one stream. Keeping the counter here
   * gives text, reasoning, tool activity, errors, and completion one shared
   * order.
   */
  const started = Stream.succeed(createRuntimeStartedEvent(options.request, 0));
  // End the runner stream at the first terminal so one turn emits exactly one
  // terminal event: a late `finish` after an in-band `error`/`blocked` can never
  // add a second, contradicting terminal.
  return Stream.concat(started, createAiSdkRuntimeEventStream(options)).pipe(
    Stream.takeUntil(isRuntimeTerminalEvent),
  );
};

const createAiSdkRuntimeEventStream = (
  options: AiSdkToolLoopAgentRunOptions,
): AiRuntimeEventStream => {
  const openedParts = createAiSdkPartStream(options);
  const mappedEvents = Effect.map(openedParts, (parts) =>
    mapAiSdkPartsToRuntimeEventStream(options.request, parts),
  );
  return Stream.unwrap(mappedEvents);
};

const mapAiSdkPartsToRuntimeEventStream = (
  request: RuntimeProviderRequest,
  parts: AsyncIterable<TextStreamPart<ToolSet>>,
): AiRuntimeEventStream => {
  // Log an unrecognized part type once per turn so a future SDK pin's new part
  // never vanishes without a signal; the mapping itself still drops it.
  const loggedUnknownPartTypes = new Set<string>();
  return Stream.fromAsyncIterable(parts, toRuntimeError).pipe(
    Stream.tap((part) => logUnknownAiSdkPart(request, loggedUnknownPartTypes, part)),
    // Turn AI SDK parts into runtime events. The mapping state owns sequence
    // numbers and flushes any pending reasoning row at stream end.
    Stream.mapAccum(
      () => createRuntimeEventMappingState(request),
      (state, part) => mapAiSdkPartToRuntimeEvents(request, state, part),
      {
        onHalt: (state) => flushReasoningOnStreamEnd(request, state),
      },
    ),
  );
};

const logUnknownAiSdkPart = (
  request: RuntimeProviderRequest,
  logged: Set<string>,
  part: TextStreamPart<ToolSet>,
): Effect.Effect<void> => {
  if (classifyAiSdkPart(part.type) !== "unknown" || logged.has(part.type)) return Effect.void;
  logged.add(part.type);
  return Effect.logWarning(
    `agent-runtime dropped an unrecognized AI SDK stream part "${part.type}" ` +
      `(provider ${request.providerId}, model ${request.modelId}); it may need mapping or the ignore list.`,
  );
};

const createAiSdkPartStream = ({
  model,
  providerOptions,
  request,
  flushIntervalMs,
  hostCommandResolver,
}: AiSdkToolLoopAgentRunOptions): Effect.Effect<
  AsyncIterable<TextStreamPart<ToolSet>>,
  AiRuntimeError
> =>
  Effect.tryPromise({
    try: async () => {
      const tools = mergeToolSets(
        createAiSdkToolSet(request.tools, request),
        createHostCommandToolSet(request.toolScope.hostCommands, request, hostCommandResolver),
      );

      /**
       * AI SDK receives the final messages passed through the runtime boundary.
       *
       * `toolChoice: "auto"` is intentional: the runtime exposes capabilities,
       * but the model chooses if/when to call them. The backend must not pre-run
       * tools because that would fake activity before the agent acts.
       */
      const agent = new AiSdkToolLoopAgent(
        omitUndefinedProperties({
          model,
          allowSystemInMessages: true,
          maxRetries: 0,
          tools,
          toolChoice: tools ? AI_SDK_TOOL_CHOICE_AUTO : undefined,
          providerOptions,
          // Neutral call settings mapped to top-level SDK settings. Absent
          // sampling/output fields drop out; `stopWhen` names the step cap.
          ...agentCallSettings(request.callSettings),
        }),
      );

      /**
       * `agent.stream` returns the stream handle; it does not buffer the answer.
       *
       * Awaiting here only waits for AI SDK to open the provider/tool-loop
       * stream. The caller still receives `result.fullStream` as a lazy
       * AsyncIterable, and Effect consumes each provider part as it arrives.
       */
      const messages = [...request.messages];
      const result = await agent.stream(
        omitUndefinedProperties({
          messages,
          abortSignal: request.abortSignal,
        }),
      );
      return coalesceTextDeltaParts(
        result.fullStream,
        flushIntervalMs ?? DEFAULT_OUTPUT_DELTA_FLUSH_MS,
      );
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
  readonly hostCommandNames: ReadonlySet<string>;
};

const createRuntimeEventMappingState = (
  request: RuntimeProviderRequest,
): RuntimeEventMappingState => ({
  sequence: 1,
  reasoningState: createReasoningStreamState(),
  runtimeTools: createRuntimeToolLookup(request.tools),
  hostCommandNames: hostCommandNameSet(request.toolScope.hostCommands),
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
   * Host commands are exposed to the model as tools, so they arrive as tool
   * parts too. Emit one `host_command` activity (on the call part) and skip the
   * synthetic result; the browser performs and completes the command.
   */
  if (isHostCommandToolPart(part, state.hostCommandNames)) {
    next.append(mapAiSdkHostCommandActivity(request, part, next.sequence));
    return [next.state(), next.events];
  }

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
