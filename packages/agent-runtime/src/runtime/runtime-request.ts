import type { RuntimeContextBoard } from "#context/context-board";
import type { RuntimeTool } from "#tools/runtime-tool";

export type RuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
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
