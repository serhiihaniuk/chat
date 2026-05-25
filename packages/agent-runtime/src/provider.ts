import type { RuntimeEvent } from "./events.js";
import type { RuntimeTool } from "./tools/tool-registry.js";

export type RuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

export type RuntimeRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly providerId?: string;
  readonly modelId: string;
  readonly messages: readonly RuntimeMessage[];
  readonly tools?: readonly RuntimeTool[];
};

export type AssistantProvider = {
  readonly providerId: string;
  readonly modelIds: readonly string[];
  stream(request: RuntimeRequest): AsyncIterable<RuntimeEvent>;
};
