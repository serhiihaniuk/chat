import { Effect } from "effect";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";

import type { ModelProvider } from "#providers/model-provider";
import { createScriptedLanguageModel } from "#testing/scripted-language-model";

export const FAKE_PROVIDER_ID = "fake" as const;
export const FAKE_ECHO_MODEL_ID = "fake-echo" as const;

export type FakeProviderOptions = {
  readonly providerId?: string | undefined;
  readonly modelIds?: readonly string[] | undefined;
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
  const codename = findPriorProjectCodename(options, userText);
  if (codename) return `Your project codename is ${codename}.`;

  return userText.length > 0 ? `Fake response: ${userText}` : "Fake response.";
};

const lastUserText = (options: LanguageModelV3CallOptions): string => {
  const userMessage = userTextMessages(options).at(-1);
  return userMessage ?? "";
};

const findPriorProjectCodename = (
  options: LanguageModelV3CallOptions,
  latestUserText: string,
): string | undefined => {
  if (!/\bwhat is my project codename\b/iu.test(latestUserText)) return undefined;

  const priorUserText = userTextMessages(options).slice(0, -1).join(" ");
  const match = /\bproject codename is (?<codename>[A-Za-z0-9][A-Za-z0-9 _-]*)(?:[.!?]|$)/u.exec(
    priorUserText,
  );
  return match?.groups?.["codename"]?.trim();
};

const userTextMessages = (options: LanguageModelV3CallOptions): readonly string[] =>
  options.prompt
    .flatMap((message) => {
      if (message.role !== "user") return [];

      return [message];
    })
    .map((message) => {
      return message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ")
        .trim();
    })
    .filter((content) => content.length > 0);
