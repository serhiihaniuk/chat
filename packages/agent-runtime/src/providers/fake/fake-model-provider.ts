import { Effect } from "effect";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import {
  RUNTIME_REASONING_EFFORTS,
  type RuntimeReasoningEffort,
} from "@side-chat/ai-runtime-contract";
import { omitUndefinedProperties } from "@side-chat/shared";

import type { ModelProvider } from "#providers/model-provider";
import { createScriptedLanguageModel } from "#testing/scripted-language-model";

export const FAKE_PROVIDER_ID = "fake" as const;
export const FAKE_ECHO_MODEL_ID = "fake-echo" as const;
export const FAKE_REASONING_EFFORTS = {
  LOW: RUNTIME_REASONING_EFFORTS.LOW,
  MEDIUM: RUNTIME_REASONING_EFFORTS.MEDIUM,
  HIGH: RUNTIME_REASONING_EFFORTS.HIGH,
} as const;

export type FakeReasoningEffort =
  (typeof FAKE_REASONING_EFFORTS)[keyof typeof FAKE_REASONING_EFFORTS];

export const DEFAULT_FAKE_REASONING_EFFORT = FAKE_REASONING_EFFORTS.MEDIUM;

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
    resolveModel: (selection) => {
      const effort = selection.reasoning?.effort ?? DEFAULT_FAKE_REASONING_EFFORT;
      const reasoning = createDemoReasoningText(effort);
      const text = (callOptions: LanguageModelV3CallOptions) =>
        createDeterministicFakeText(callOptions, effort);
      return Effect.succeed(
        createScriptedLanguageModel(
          omitUndefinedProperties({
            providerId,
            modelId: selection.modelId,
            text,
            reasoning,
          }),
        ),
      );
    },
  };
};

const createDeterministicFakeText = (
  options: LanguageModelV3CallOptions,
  effort: RuntimeReasoningEffort,
): string => {
  const userText = lastUserText(options);
  const title = createDeterministicTitle(userText);
  if (title) return title;

  const codename = findPriorProjectCodename(options, userText);
  if (codename) return `Your project codename is ${codename}.`;

  const canned = createShowcaseAnswer(userText, effort);
  if (canned) return canned;

  return userText.length > 0 ? `Fake response: ${userText}` : "Fake response.";
};

const createDemoReasoningText = (effort: RuntimeReasoningEffort): string | undefined => {
  const level = normalizeReasoningEffort(effort);
  if (level === undefined) return undefined;

  const body = {
    [FAKE_REASONING_EFFORTS.LOW]:
      "Read the latest message, pick the deterministic demo answer, and keep the response short.",
    [FAKE_REASONING_EFFORTS.MEDIUM]:
      "Read the latest message, check useful prior chat context, and choose a concise showcase answer.",
    [FAKE_REASONING_EFFORTS.HIGH]:
      "Read the latest message, compare it with prior context, preserve deterministic demo behavior, and explain the next useful step clearly.",
  }[level];

  return `**Thinking (${level})** ${body}`;
};

const createShowcaseAnswer = (
  userText: string,
  effort: RuntimeReasoningEffort,
): string | undefined => {
  if (/\b(what is your mission|mission)\b/iu.test(userText)) {
    return "My mission is to sit inside the workspace, keep context close, and help turn host-app state into concrete next steps.";
  }
  if (/\b(what tools do you have|tools)\b/iu.test(userText)) {
    return "In this fake demo I can show model selection, thinking levels, conversation history, iframe open-state control, and deterministic local tool activity without calling a real model.";
  }
  if (/\b(thinking|reasoning|think)\b/iu.test(userText)) {
    return `This fake provider is using ${formatReasoningEffort(effort)} thinking, so the activity row changes while the rest of the app still streams through the real runtime path.`;
  }
  return undefined;
};

const normalizeReasoningEffort = (
  effort: RuntimeReasoningEffort,
): FakeReasoningEffort | undefined => {
  if (effort === RUNTIME_REASONING_EFFORTS.NONE) return undefined;
  if (effort === RUNTIME_REASONING_EFFORTS.HIGH || effort === RUNTIME_REASONING_EFFORTS.XHIGH) {
    return FAKE_REASONING_EFFORTS.HIGH;
  }
  if (effort === RUNTIME_REASONING_EFFORTS.LOW || effort === RUNTIME_REASONING_EFFORTS.MINIMAL) {
    return FAKE_REASONING_EFFORTS.LOW;
  }
  return FAKE_REASONING_EFFORTS.MEDIUM;
};

const formatReasoningEffort = (effort: RuntimeReasoningEffort): string => {
  const normalized = normalizeReasoningEffort(effort);
  return normalized ?? "no";
};

const createDeterministicTitle = (userText: string): string | undefined => {
  if (!userText.startsWith("Prepare a short conversation title")) return undefined;

  const firstUserMessage = sectionText(userText, "User message:", "Assistant response:");
  const titleWords = titleKeywords(userText);
  if (/\b(hello|hi)\b/iu.test(firstUserMessage)) {
    return sentenceCaseTitle([...titleWords, "greeting"]);
  }
  return sentenceCaseTitle(titleWords);
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

const sectionText = (text: string, startLabel: string, endLabel: string): string => {
  const start = text.indexOf(startLabel);
  const end = text.indexOf(endLabel);
  if (start < 0 || end < start) return "";
  return text.slice(start + startLabel.length, end).trim();
};

const titleKeywords = (text: string): readonly string[] => {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const word of text.toLocaleLowerCase("en-US").match(/[a-z0-9]+/gu) ?? []) {
    if (titleStopWords.has(word) || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
    if (words.length === 6) break;
  }
  return words;
};

const sentenceCaseTitle = (words: readonly string[]): string =>
  words.length === 0
    ? "New conversation"
    : `${words.join(" ").charAt(0).toLocaleUpperCase("en-US")}${words.join(" ").slice(1)}`;

const titleStopWords = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "assistant",
  "be",
  "chat",
  "completed",
  "conversation",
  "did",
  "do",
  "does",
  "exchange",
  "exactly",
  "explain",
  "fake",
  "for",
  "from",
  "hello",
  "hi",
  "i",
  "in",
  "is",
  "it",
  "message",
  "of",
  "on",
  "prepare",
  "reply",
  "response",
  "short",
  "the",
  "this",
  "title",
  "to",
  "user",
  "was",
  "what",
  "who",
  "with",
  "you",
]);
