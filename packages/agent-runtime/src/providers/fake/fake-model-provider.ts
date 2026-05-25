import { Effect } from "effect";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";

import type { ModelProvider } from "#providers/model-provider";
import { createScriptedLanguageModel } from "#testing/scripted-language-model";

export const FAKE_PROVIDER_ID = "fake" as const;
export const FAKE_ECHO_MODEL_ID = "fake-echo" as const;

export type FakeProviderOptions = {
  readonly providerId?: string;
  readonly modelIds?: readonly string[];
};

export const createFakeProvider = (options: FakeProviderOptions = {}): ModelProvider => {
  const providerId = options.providerId ?? FAKE_PROVIDER_ID;
  const modelIds = options.modelIds ?? [FAKE_ECHO_MODEL_ID];

  return {
    providerId,
    modelIds,
    resolveModel: (selection) =>
      Effect.succeed(
        createScriptedLanguageModel({
          providerId,
          modelId: selection.modelId,
          reasoning: "**Selected deterministic echo script**",
          text: createDeterministicEchoText,
        }),
      ),
  };
};

const createDeterministicEchoText = (options: LanguageModelV3CallOptions): string => {
  const userText = lastUserText(options);
  return userText.length > 0 ? `Fake response: ${userText}` : "Fake response.";
};

const lastUserText = (options: LanguageModelV3CallOptions): string => {
  const userMessage = [...options.prompt].reverse().find((message) => message.role === "user");
  if (!userMessage || userMessage.role !== "user") return "";

  return userMessage.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
};
