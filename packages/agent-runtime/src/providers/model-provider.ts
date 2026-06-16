import type { Effect } from "effect";
import type { LanguageModel, ToolLoopAgentSettings } from "ai";
import type { AiRuntimeError } from "@side-chat/ai-runtime-contract";

export type ProviderSelection = {
  readonly providerId: string;
  readonly modelId: string;
};

export type ModelProvider = {
  readonly providerId: string;
  readonly modelIds: readonly string[];
  resolveModel(selection: ProviderSelection): Effect.Effect<LanguageModel, AiRuntimeError>;
  resolveProviderOptions?:
    | ((
        selection: ProviderSelection,
      ) => Effect.Effect<ToolLoopAgentSettings["providerOptions"] | undefined, AiRuntimeError>)
    | undefined;
};
