import type { ModelReasoningEffort } from "#application/ports/model-provider";
import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";

export interface SerializableChatMessage {
  readonly role: "assistant" | "user";
  readonly content: string;
}

/** Everything crossing into the workflow realm is plain configuration data. */
export interface ChatTurnWorkflowInput {
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly requestId: string;
  readonly modelId: string;
  readonly reasoningEffort?: ModelReasoningEffort | undefined;
  readonly instructions: string;
  readonly maxSteps: number;
  readonly providerTimeoutMs: number;
  readonly clientToolTimeoutMs: number;
  readonly messages: readonly SerializableChatMessage[];
  readonly clientTools: readonly ClientToolDefinition[];
  readonly enabledToolNames?: readonly string[] | undefined;
}
