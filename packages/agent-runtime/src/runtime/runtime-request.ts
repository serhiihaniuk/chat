import type { JsonObject } from "@side-chat/chat-protocol";
import type { RuntimeTool } from "#tools/runtime-tool";

export type RuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

/**
 * The context board is already selected, authorized, and compressed context.
 *
 * Building or squashing this board belongs to the consuming app/core. The
 * runtime only renders it into model-facing messages for one assistant turn.
 */
export type RuntimeContextBoard = {
  readonly sections: readonly RuntimeContextSection[];
  readonly manifest?: RuntimeContextManifest;
};

export type RuntimeContextSection = {
  readonly title: string;
  readonly content: string;
  readonly priority?: number;
  readonly metadata?: JsonObject;
};

export type RuntimeContextManifest = {
  readonly snapshotId?: string;
  readonly snapshotHash?: string;
  readonly includedMessageIds?: readonly string[];
  readonly budget?: JsonObject;
};

export type AgentRuntimeRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly profileId?: string;
  readonly messages: readonly RuntimeMessage[];
  readonly contextBoard?: RuntimeContextBoard;
  readonly availableToolNames?: readonly string[];
  readonly tools?: readonly RuntimeTool[];
  readonly abortSignal?: AbortSignal;
};

export type RuntimeProviderRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly messages: readonly RuntimeMessage[];
  readonly tools?: readonly RuntimeTool[];
  readonly abortSignal?: AbortSignal;
};
