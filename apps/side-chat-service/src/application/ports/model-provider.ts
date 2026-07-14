import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { SideChatReasoningEffort } from "@side-chat/stream-profile";

/** Provider-neutral reasoning value admitted by the native chat boundary. */
export type ModelReasoningEffort = SideChatReasoningEffort;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ProviderOptions = Record<string, Record<string, JsonValue>>;

/** Runtime marker for the model value that may cross a Workflow boundary. */
export const DURABLE_MODEL_HANDLE = Symbol("side-chat.durable-model-handle");

type DurableModelMarker = {
  readonly [DURABLE_MODEL_HANDLE]: true;
};

export type DurableLanguageModel = LanguageModelV4 & DurableModelMarker;

export type ResolvedModel = {
  readonly model: DurableLanguageModel;
  readonly providerOptions?: ProviderOptions | undefined;
};

/** Application-owned model lookup; composition decides which provider implements it. */
export interface ModelProvider {
  readonly modelFor: (selection: ModelSelection) => ResolvedModel;
}

export interface ModelSelection {
  readonly modelId: string;
  readonly requestId: string;
  readonly reasoningEffort?: ModelReasoningEffort | undefined;
}

/** Reject ids and opaque SDK models that cannot safely cross a Workflow boundary. */
export function assertDurableModelHandle(model: unknown): asserts model is DurableLanguageModel {
  if (typeof model === "string" || !hasDurableModelMarker(model)) {
    throw new TypeError("Side Chat agents require a Workflow-serializable model handle");
  }
}

function hasDurableModelMarker(value: unknown): value is DurableModelMarker {
  return (
    typeof value === "object" && value !== null && Reflect.get(value, DURABLE_MODEL_HANDLE) === true
  );
}
