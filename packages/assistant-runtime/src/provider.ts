import type { RuntimeEvent } from "./events.js";

export type RuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

export type RuntimeRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly modelId: string;
  readonly messages: readonly RuntimeMessage[];
  readonly toolNames?: readonly string[];
};

export type AssistantProvider = {
  readonly providerId: string;
  readonly modelIds: readonly string[];
  stream(request: RuntimeRequest): AsyncIterable<RuntimeEvent>;
};
