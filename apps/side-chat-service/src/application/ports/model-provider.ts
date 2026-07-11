import type { LanguageModel } from "ai";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ProviderOptions = Record<string, Record<string, JsonValue>>;

export type ModelInstance = Exclude<LanguageModel, string>;

export type ResolvedModel = {
  readonly model: ModelInstance;
  readonly providerOptions?: ProviderOptions | undefined;
};

/** Application-owned model lookup; composition decides which provider implements it. */
export interface ModelProvider {
  readonly modelFor: (selection: ModelSelection) => ResolvedModel;
}

export interface ModelSelection {
  readonly modelId: string;
  readonly requestId: string;
}

/** Reject AI SDK string ids because they silently route through the global Gateway provider. */
export function assertModelInstance(model: LanguageModel): asserts model is ModelInstance {
  if (typeof model === "string") {
    throw new TypeError("Side Chat agents require a constructed model instance, not a model id");
  }
}
