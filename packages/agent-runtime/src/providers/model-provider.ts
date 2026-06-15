import type { Effect } from "effect";
import type { LanguageModel, ToolLoopAgentSettings } from "ai";

import type { AgentRuntimeError } from "#runtime/contract/runtime-error";

export type ProviderSelection = {
  readonly providerId: string;
  readonly modelId: string;
};

export type ModelProvider = {
  readonly providerId: string;
  readonly modelIds: readonly string[];
  resolveModel(selection: ProviderSelection): Effect.Effect<LanguageModel, AgentRuntimeError>;
  resolveProviderOptions?:
    | ((
        selection: ProviderSelection,
      ) => Effect.Effect<ToolLoopAgentSettings["providerOptions"] | undefined, AgentRuntimeError>)
    | undefined;
};
