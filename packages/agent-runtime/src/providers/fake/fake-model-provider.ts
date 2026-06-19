import { Effect } from "effect";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { omitUndefinedProperties } from "@side-chat/shared";

import type { ModelProvider } from "#providers/model-provider";
import { createScriptedLanguageModel } from "#testing/scripted-language-model";
import {
  createDemoReasoningText,
  createDemoToolCall,
  createDeterministicFakeText,
  DEFAULT_FAKE_REASONING_EFFORT,
  FAKE_REASONING_EFFORTS,
  type FakeReasoningEffort,
} from "./fake-demo-script.js";

export { DEFAULT_FAKE_REASONING_EFFORT, FAKE_REASONING_EFFORTS, type FakeReasoningEffort };

export const FAKE_PROVIDER_ID = "fake" as const;
export const FAKE_ECHO_MODEL_ID = "fake-echo" as const;

export type FakeProviderOptions = {
  readonly providerId?: string | undefined;
  readonly modelIds?: readonly string[] | undefined;
  readonly streamDelayMs?: number | undefined;
};

const DEFAULT_FAKE_STREAM_DELAY_MS = 24;

export const createFakeProvider = (options: FakeProviderOptions = {}): ModelProvider => {
  const providerId = options.providerId ?? FAKE_PROVIDER_ID;
  const modelIds = options.modelIds ?? [FAKE_ECHO_MODEL_ID];
  const streamDelayMs = options.streamDelayMs ?? DEFAULT_FAKE_STREAM_DELAY_MS;

  return {
    providerId,
    modelIds,
    resolveModel: (selection) => {
      const effort = selection.reasoning?.effort ?? DEFAULT_FAKE_REASONING_EFFORT;
      const reasoning = (callOptions: LanguageModelV3CallOptions) =>
        createDemoReasoningText(effort, callOptions);
      const text = (callOptions: LanguageModelV3CallOptions) =>
        createDeterministicFakeText(callOptions, effort);
      const toolCall = (callOptions: LanguageModelV3CallOptions) => createDemoToolCall(callOptions);
      return Effect.succeed(
        createScriptedLanguageModel(
          omitUndefinedProperties({
            providerId,
            modelId: selection.modelId,
            text,
            reasoning,
            toolCall,
            streamDelayMs,
          }),
        ),
      );
    },
  };
};
