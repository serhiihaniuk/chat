import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";

type FinishPart = Extract<LanguageModelV4StreamPart, { type: "finish" }>;
type FinishReason = FinishPart["finishReason"]["unified"];
type OutputTokens = FinishPart["usage"]["outputTokens"];

/** One output text token, no reasoning — the usage most scripted finishes carry. */
const ONE_TEXT_TOKEN: OutputTokens = { total: 1, text: 1, reasoning: undefined };

/** The `stream-start` part every scripted model stream opens with. */
export function streamStart(): LanguageModelV4StreamPart {
  return { type: "stream-start", warnings: [] };
}

/** A `text-start` / `text-delta` / `text-end` block for one contiguous string. */
export function textBlock(text: string, id = "text"): readonly LanguageModelV4StreamPart[] {
  return [
    { type: "text-start", id },
    { type: "text-delta", id, delta: text },
    { type: "text-end", id },
  ];
}

/** A `reasoning-start` / `reasoning-delta` / `reasoning-end` block. */
export function reasoningBlock(
  text: string,
  id = "reasoning",
): readonly LanguageModelV4StreamPart[] {
  return [
    { type: "reasoning-start", id },
    { type: "reasoning-delta", id, delta: text },
    { type: "reasoning-end", id },
  ];
}

/** A single `tool-call` part carrying a JSON-string input. */
export function toolCallPart(call: {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: string;
}): LanguageModelV4StreamPart {
  return { type: "tool-call", ...call };
}

/**
 * The `finish` part with its nested usage envelope. Defaults to one input and one
 * output text token; pass `output` (an `*_OUTPUT_TOKENS` constant) for the
 * reasoning-only, tool-call, or empty-completion variants.
 */
export function finishPart(
  reason: FinishReason = "stop",
  output: OutputTokens = ONE_TEXT_TOKEN,
): LanguageModelV4StreamPart {
  return {
    type: "finish",
    finishReason: { unified: reason, raw: reason },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: output,
    },
  };
}

/** No output tokens — the usage an empty (text-less) completion carries. */
export const NO_OUTPUT_TOKENS: OutputTokens = {
  total: 0,
  text: 0,
  reasoning: undefined,
};

/** Output usage for a turn whose only output is tool calls (no text, no reasoning). */
export const TOOL_CALL_OUTPUT_TOKENS: OutputTokens = {
  total: 1,
  text: 0,
  reasoning: undefined,
};

/** Output usage for a reasoning-only turn (one reasoning token, no text). */
export const REASONING_OUTPUT_TOKENS: OutputTokens = {
  total: 1,
  text: 0,
  reasoning: 1,
};

/**
 * Fluent builder for a scripted model stream: chain content parts, then `finish()`
 * to get the complete part list. Replaces the hand-rolled `stream-start` + part +
 * verbose `finish` triples scripted streams would otherwise repeat.
 */
export function modelStream(): ModelStreamBuilder {
  const parts: LanguageModelV4StreamPart[] = [streamStart()];
  const builder: ModelStreamBuilder = {
    text(text, id) {
      parts.push(...textBlock(text, id));
      return builder;
    },
    reasoning(text, id) {
      parts.push(...reasoningBlock(text, id));
      return builder;
    },
    toolCall(call) {
      parts.push(toolCallPart(call));
      return builder;
    },
    part(part) {
      parts.push(part);
      return builder;
    },
    finish(reason, output) {
      parts.push(finishPart(reason, output));
      return parts;
    },
  };
  return builder;
}

export type ModelStreamBuilder = {
  /** Append a text block (`text-start`/`delta`/`end`). */
  readonly text: (text: string, id?: string) => ModelStreamBuilder;
  /** Append a reasoning block (`reasoning-start`/`delta`/`end`). */
  readonly reasoning: (text: string, id?: string) => ModelStreamBuilder;
  /** Append one `tool-call` part. */
  readonly toolCall: (call: {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly input: string;
  }) => ModelStreamBuilder;
  /** Append any raw part, for shapes the helpers do not cover. */
  readonly part: (part: LanguageModelV4StreamPart) => ModelStreamBuilder;
  /** Append the terminal `finish` part and return the complete part list. */
  readonly finish: (
    reason?: FinishReason,
    output?: OutputTokens,
  ) => readonly LanguageModelV4StreamPart[];
};
