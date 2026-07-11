import type { LanguageModel } from "ai";

/** Application-owned model lookup; composition decides which provider implements it. */
export interface ModelProvider {
  readonly modelFor: (selection: ModelSelection) => LanguageModel;
}

export interface ModelSelection {
  readonly modelId: string;
  readonly requestId: string;
}
