import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import type { JsonObject } from "@side-chat/shared";

type ScriptedFinishReason = LanguageModelV3FinishReason["unified"];

const STOP_FINISH_REASON: ScriptedFinishReason = "stop";
const TOOL_CALLS_FINISH_REASON: ScriptedFinishReason = "tool-calls";

export type ScriptedToolCall = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: JsonObject;
  readonly title?: string | undefined;
};

export type ScriptedLanguageModelOptions = {
  readonly providerId: string;
  readonly modelId: string;
  readonly reasoning?: string | ((options: LanguageModelV3CallOptions) => string | undefined);
  readonly text?: string | ((options: LanguageModelV3CallOptions) => string);
  readonly toolCall?:
    | ScriptedToolCall
    | ((options: LanguageModelV3CallOptions) => ScriptedToolCall | undefined);
  readonly streamDelayMs?: number | undefined;
  // Lets a test drive a non-stop provider stop, e.g. "content-filter" to exercise
  // safety-stop mapping. Defaults to a normal stop.
  readonly finishReason?: ScriptedFinishReason | undefined;
  readonly onStreamCall?: (options: LanguageModelV3CallOptions) => void;
};

export const createScriptedLanguageModel = ({
  modelId,
  onStreamCall,
  providerId,
  reasoning,
  text = "Scripted response.",
  toolCall,
  streamDelayMs = 0,
  finishReason = STOP_FINISH_REASON,
}: ScriptedLanguageModelOptions): LanguageModelV3 => ({
  specificationVersion: "v3",
  provider: providerId,
  modelId,
  supportedUrls: {},
  doGenerate: (options) =>
    Promise.resolve(
      createGenerateResult(readText(text, options), countInputTokens(options), finishReason),
    ),
  doStream: (options) => {
    onStreamCall?.(options);
    const resolvedToolCall = readToolCall(toolCall, options);
    return Promise.resolve(
      createStreamResult({
        abortSignal: options.abortSignal,
        inputTokenCount: countInputTokens(options),
        reasoning: reasoning ? readOptionalText(reasoning, options) : undefined,
        text: readText(text, options),
        finishReason: resolvedToolCall ? TOOL_CALLS_FINISH_REASON : finishReason,
        streamDelayMs,
        toolCall: resolvedToolCall,
      }),
    );
  },
});

const createGenerateResult = (
  text: string,
  inputTokenCount: number,
  finishReason: ScriptedFinishReason,
): LanguageModelV3GenerateResult => ({
  content: [{ type: "text", text }],
  finishReason: { unified: finishReason, raw: finishReason },
  usage: createUsage(text, inputTokenCount),
  warnings: [],
});

const createStreamResult = ({
  abortSignal,
  inputTokenCount,
  reasoning,
  text,
  finishReason,
  streamDelayMs,
  toolCall,
}: {
  readonly abortSignal?: AbortSignal | undefined;
  readonly inputTokenCount: number;
  readonly reasoning?: string | undefined;
  readonly text: string;
  readonly finishReason: ScriptedFinishReason;
  readonly streamDelayMs: number;
  readonly toolCall?: ScriptedToolCall | undefined;
}): LanguageModelV3StreamResult => ({
  stream: new ReadableStream<LanguageModelV3StreamPart>({
    async start(controller) {
      try {
        const emit = createDelayedEmitter(controller, streamDelayMs, abortSignal);
        await emit({ type: "stream-start", warnings: [] });
        await emitReasoning(emit, reasoning);
        if (toolCall) {
          await emitToolCall(emit, toolCall);
        } else {
          await emitText(emit, text);
        }
        await emit({
          type: "finish",
          finishReason: { unified: finishReason, raw: finishReason },
          usage: createUsage(toolCall ? "" : text, inputTokenCount),
        });
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  }),
});

const readText = (
  text: string | ((options: LanguageModelV3CallOptions) => string),
  options: LanguageModelV3CallOptions,
): string => (typeof text === "function" ? text(options) : text);

const readOptionalText = (
  text: string | ((options: LanguageModelV3CallOptions) => string | undefined),
  options: LanguageModelV3CallOptions,
): string | undefined => (typeof text === "function" ? text(options) : text);

const readToolCall = (
  toolCall:
    | ScriptedToolCall
    | ((options: LanguageModelV3CallOptions) => ScriptedToolCall | undefined)
    | undefined,
  options: LanguageModelV3CallOptions,
): ScriptedToolCall | undefined => {
  if (!toolCall) return undefined;
  return typeof toolCall === "function" ? toolCall(options) : toolCall;
};

const createDelayedEmitter =
  (
    controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>,
    delayMs: number,
    abortSignal: AbortSignal | undefined,
  ) =>
  async (part: LanguageModelV3StreamPart): Promise<void> => {
    throwIfAborted(abortSignal);
    controller.enqueue(part);
    await sleep(delayMs, abortSignal);
  };

const emitReasoning = async (
  emit: (part: LanguageModelV3StreamPart) => Promise<void>,
  reasoning: string | undefined,
): Promise<void> => {
  if (!reasoning || reasoning.trim().length === 0) return;
  await emit({ type: "reasoning-start", id: "reasoning_1" });
  await emit({ type: "reasoning-delta", id: "reasoning_1", delta: reasoning });
  await emit({ type: "reasoning-end", id: "reasoning_1" });
};

const emitText = async (
  emit: (part: LanguageModelV3StreamPart) => Promise<void>,
  text: string,
): Promise<void> => {
  await emit({ type: "text-start", id: "text_1" });
  for (const part of splitText(text)) {
    await emit({ type: "text-delta", id: "text_1", delta: part });
  }
  await emit({ type: "text-end", id: "text_1" });
};

const emitToolCall = async (
  emit: (part: LanguageModelV3StreamPart) => Promise<void>,
  toolCall: ScriptedToolCall,
): Promise<void> => {
  const input = JSON.stringify(toolCall.input);
  await emit(createToolInputStartPart(toolCall));
  await emit({ type: "tool-input-delta", id: toolCall.toolCallId, delta: input });
  await emit({ type: "tool-input-end", id: toolCall.toolCallId });
  await emit({
    type: "tool-call",
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input,
  });
};

const createToolInputStartPart = (toolCall: ScriptedToolCall): LanguageModelV3StreamPart => {
  const base = {
    type: "tool-input-start",
    id: toolCall.toolCallId,
    toolName: toolCall.toolName,
  } as const;
  return toolCall.title ? { ...base, title: toolCall.title } : base;
};

const splitText = (text: string): readonly string[] => {
  const words = text.split(/(\s+)/u).filter((part) => part.length > 0);
  return words.length > 0 ? words : [""];
};

const sleep = (delayMs: number, abortSignal: AbortSignal | undefined): Promise<void> => {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    abortSignal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        const reason: unknown = abortSignal.reason;
        reject(reason instanceof Error ? reason : new Error("Scripted stream aborted."));
      },
      { once: true },
    );
  });
};

const throwIfAborted = (abortSignal: AbortSignal | undefined): void => {
  if (!abortSignal?.aborted) return;
  const reason: unknown = abortSignal.reason;
  if (reason instanceof Error) throw reason;
  throw new Error("Scripted stream aborted.");
};

const createUsage = (text: string, inputTokenCount: number): LanguageModelV3Usage => ({
  inputTokens: {
    total: inputTokenCount,
    noCache: inputTokenCount,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: countTokens(text),
    text: countTokens(text),
    reasoning: undefined,
  },
});

const countTokens = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/u).length;

const countInputTokens = (options: LanguageModelV3CallOptions): number =>
  options.prompt
    .filter((message) => message.role === "user")
    .flatMap((message) => (message.role === "user" ? message.content : []))
    .filter((part) => part.type === "text")
    .reduce((total, part) => total + countTokens(part.text), 0);
