import type { ModelProvider } from "#providers/model-provider";
import type { AssistantProfile } from "#profiles/assistant-profile";
import type { RuntimeTool } from "#tools/runtime-tool";

export type RuntimeServices = {
  readonly providers: readonly ModelProvider[];
  readonly profiles: readonly AssistantProfile[];
  readonly tools: readonly RuntimeTool[];
};
