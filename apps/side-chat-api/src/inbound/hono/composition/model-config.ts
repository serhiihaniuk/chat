import type { ModelSelection } from "@side-chat/shared-protocol";

export const supportedModels: ModelSelection[] = [
  { provider: "openai", id: "gpt-5.4-nano", reasoningEffort: "high" },
];
