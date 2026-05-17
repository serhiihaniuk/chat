import type {
  ModelSelection,
  TokenUsage,
} from "@side-chat/shared-protocol";

const modelPricingPerMillion: Record<
  string,
  { inputUsd: number; outputUsd: number; cachedInputUsd?: number }
> = {
  "gpt-5.4-nano": { inputUsd: 0.05, outputUsd: 0.2, cachedInputUsd: 0.005 },
};

/**
 * Adds product-owned cost metadata after the provider returns token usage.
 * Provider adapters report raw tokens; the application decides pricing.
 */
export const enrichUsage = (
  model: ModelSelection,
  usage: TokenUsage,
): TokenUsage => {
  const pricing = modelPricingPerMillion[model.id];
  if (!pricing || usage.estimatedCostUsd !== undefined) return usage;

  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const billableInputTokens = Math.max(0, usage.inputTokens - cachedInputTokens);
  const cachedInputCost =
    (cachedInputTokens / 1_000_000) *
    (pricing.cachedInputUsd ?? pricing.inputUsd);
  const inputCost = (billableInputTokens / 1_000_000) * pricing.inputUsd;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputUsd;

  return {
    ...usage,
    estimatedCostUsd: Number(
      (inputCost + cachedInputCost + outputCost).toFixed(6),
    ),
  };
};
