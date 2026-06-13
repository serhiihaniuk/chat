import type { JsonObject } from "@side-chat/chat-protocol";
import type { RuntimeTool } from "#tools/runtime-tool";

export type RuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

/**
 * The context board is already selected, authorized, and compressed context.
 *
 * Building or squashing this board belongs to partner-ai-core workflows and
 * app-owned ports. The runtime only renders it into model-facing messages for
 * one assistant turn.
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

/**
 * AgentRuntimeRequest is the public per-turn input contract.
 *
 * Source callers provide approved messages, optional prepared context, optional
 * executor/provider/model/profile hints, and the exact tool allowlist for this
 * turn.
 */
export type AgentRuntimeRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly executorId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly profileId?: string;
  readonly messages: readonly RuntimeMessage[];
  readonly contextBoard?: RuntimeContextBoard;
  readonly availableToolNames?: readonly string[];
  readonly tools?: readonly RuntimeTool[];
  readonly abortSignal?: AbortSignal;
};

/**
 * RuntimeProviderRequest is the private request handed to the model runner.
 *
 * At this point profile/request choices have produced concrete provider/model
 * ids, tools are selected, and prompt/context messages are rendered into the
 * provider-neutral message list.
 */
export type RuntimeProviderRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly messages: readonly RuntimeMessage[];
  readonly tools?: readonly RuntimeTool[];
  readonly abortSignal?: AbortSignal;
};
