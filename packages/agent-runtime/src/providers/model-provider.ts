import type { Effect } from "effect";
import type { LanguageModel, ToolLoopAgentSettings } from "ai";

import type { AgentRuntimeError } from "#runtime/runtime-error";
import type { ProviderSelection } from "./provider-selection.js";

export type ModelProvider = {
  readonly providerId: string;
  readonly modelIds: readonly string[];
  resolveModel(selection: ProviderSelection): Effect.Effect<LanguageModel, AgentRuntimeError>;
  resolveProviderOptions?(
    selection: ProviderSelection,
  ): Effect.Effect<ToolLoopAgentSettings["providerOptions"] | undefined, AgentRuntimeError>;
};
