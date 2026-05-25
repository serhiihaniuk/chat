import type { LanguageModelUsage } from "ai";

import type { RuntimeUsage } from "#runtime/runtime-event";

export const toRuntimeUsage = (usage: LanguageModelUsage): RuntimeUsage => ({
  inputTokens: usage.inputTokens ?? 0,
  outputTokens: usage.outputTokens ?? 0,
  totalTokens: usage.totalTokens ?? 0,
});
