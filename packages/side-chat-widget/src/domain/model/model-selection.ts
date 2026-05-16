import type { ModelSelection } from "@side-chat/shared-protocol";

export const fallbackModel: ModelSelection = {
  provider: "openai",
  id: "gpt-5.4-nano",
  reasoningEffort: "high",
};

export const defaultModelAliasId = "gpt-5.5";

export const modelAliasOptions = [
  {
    id: defaultModelAliasId,
    label: "GPT 5.5",
    description: "Current model in a nicer jacket",
  },
  {
    id: "gpt-6.0",
    label: "GPT 6.0",
    description: "Absolutely not suspiciously early",
  },
  {
    id: "claude-mythos",
    label: "Claude Mythos",
    description: "Too powerful for public beta",
  },
  {
    id: "claude-mythos-2",
    label: "Claude Mythos 2",
    description: "Found a zero-day in the roadmap",
  },
] as const;

export const resolveModelAliasId = (aliasId: string) =>
  modelAliasOptions.some((option) => option.id === aliasId)
    ? aliasId
    : defaultModelAliasId;
