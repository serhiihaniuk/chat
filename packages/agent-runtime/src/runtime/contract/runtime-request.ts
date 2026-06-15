import type { JsonObject } from "@side-chat/shared";
import type { RuntimeTool, RuntimeToolScope } from "#tools/runtime-tool";

export type RuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

/**
 * Context that is ready to show the model.
 *
 * It has already been selected and shortened. Runtime only places it into the
 * message list.
 */
export type RuntimeContextBoard = {
  readonly sections: readonly RuntimeContextSection[];
  readonly manifest?: RuntimeContextManifest;
};

/**
 * A titled piece of approved context.
 */
export type RuntimeContextSection = {
  readonly title: string;
  readonly content: string;
  readonly priority?: number;
  readonly metadata?: JsonObject;
};

/**
 * Optional debug data for a prepared context board.
 *
 * This describes what was selected; it is not model configuration.
 */
export type RuntimeContextManifest = {
  readonly snapshotId?: string;
  readonly snapshotHash?: string;
  readonly includedMessageIds?: readonly string[];
  readonly history?: JsonObject;
  readonly budget?: JsonObject;
};

/**
 * One turn handed from core to runtime.
 *
 * Messages and allowed tools are already chosen. Empty profile/provider/model
 * fields mean "use the runtime defaults."
 */
export type AgentRuntimeRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly executorId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly profileId?: string;
  readonly systemInstructions?: string;
  readonly messages: readonly RuntimeMessage[];
  readonly contextBoard?: RuntimeContextBoard;
  readonly availableToolNames?: readonly string[];
  readonly tools?: readonly RuntimeTool[];
  readonly toolScope?: RuntimeToolScope;
  readonly abortSignal?: AbortSignal;
};

/**
 * What an executor receives after turn setup.
 *
 * Ids, messages, and tools are final for this turn.
 */
export type RuntimeProviderRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly messages: readonly RuntimeMessage[];
  readonly tools?: readonly RuntimeTool[];
  readonly toolScope?: RuntimeToolScope;
  readonly abortSignal?: AbortSignal;
};
