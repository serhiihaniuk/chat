import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";

type ScriptedFinishReason = LanguageModelV3FinishReason["unified"];

const STOP_FINISH_REASON: ScriptedFinishReason = "stop";

export type ScriptedLanguageModelOptions = {
  readonly providerId: string;
  readonly modelId: string;
  readonly reasoning?: string | ((options: LanguageModelV3CallOptions) => string);
  readonly text?: string | ((options: LanguageModelV3CallOptions) => string);
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
    return Promise.resolve(
      createStreamResult({
        inputTokenCount: countInputTokens(options),
        reasoning: reasoning ? readText(reasoning, options) : undefined,
        text: readText(text, options),
        finishReason,
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
  inputTokenCount,
  reasoning,
  text,
  finishReason,
}: {
  readonly inputTokenCount: number;
  readonly reasoning?: string | undefined;
  readonly text: string;
  readonly finishReason: ScriptedFinishReason;
}): LanguageModelV3StreamResult => ({
  stream: new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      if (reasoning && reasoning.trim().length > 0) {
        controller.enqueue({ type: "reasoning-start", id: "reasoning_1" });
        controller.enqueue({ type: "reasoning-delta", id: "reasoning_1", delta: reasoning });
        controller.enqueue({ type: "reasoning-end", id: "reasoning_1" });
      }
      controller.enqueue({ type: "text-start", id: "text_1" });
      for (const part of splitText(text)) {
        controller.enqueue({ type: "text-delta", id: "text_1", delta: part });
      }
      controller.enqueue({ type: "text-end", id: "text_1" });
      controller.enqueue({
        type: "finish",
        finishReason: { unified: finishReason, raw: finishReason },
        usage: createUsage(text, inputTokenCount),
      });
      controller.close();
    },
  }),
});

const readText = (
  text: string | ((options: LanguageModelV3CallOptions) => string),
  options: LanguageModelV3CallOptions,
): string => (typeof text === "function" ? text(options) : text);

const splitText = (text: string): readonly string[] => {
  const words = text.split(/(\s+)/u).filter((part) => part.length > 0);
  return words.length > 0 ? words : [""];
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
