import type { ModelReasoningEffort } from "#application/ports/model-provider";
import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import type { DurableActorRef } from "@side-chat/side-chat-server";

export interface SerializableChatMessage {
  readonly role: "assistant" | "user";
  readonly content: string;
}

/** Everything crossing into the workflow realm is plain configuration data. */
export interface ChatTurnWorkflowInput {
  readonly actor: DurableActorRef;
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
  readonly clientToolCapabilityDigest?: string | undefined;
  readonly enabledToolNames?: readonly string[] | undefined;
}
