import type { ModelSelection } from "@side-chat/shared-protocol";

/**
 * Model-selection domain rules. The visible aliases are demo affordances; the
 * actual provider/model sent to the backend remains the configured fallback.
 */
export const fallbackModel: ModelSelection = {
  provider: "openai",
  id: "gpt-5.4-nano",
  reasoningEffort: "medium",
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

export const applyModelAliasReasoning = (
  model: ModelSelection,
  aliasId: string,
): ModelSelection => ({
  ...model,
  reasoningEffort:
    resolveModelAliasId(aliasId) === defaultModelAliasId ? "medium" : "high",
});
