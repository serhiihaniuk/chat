import type { JsonObject } from "@side-chat/shared";
import type { RuntimeTool, RuntimeToolScope } from "#tools/runtime-tool";
import type {
  AssistantTurnId,
  ExecutorId,
  ModelId,
  ProfileId,
  ProviderId,
  RequestId,
} from "./ids/runtime-ids.js";

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
  readonly manifest?: RuntimeContextManifest | undefined;
};

/**
 * A titled piece of approved context.
 */
export type RuntimeContextSection = {
  readonly title: string;
  readonly content: string;
  readonly priority?: number | undefined;
  readonly metadata?: JsonObject | undefined;
};

/**
 * Optional debug data for a prepared context board.
 *
 * This describes what was selected; it is not model configuration.
 */
export type RuntimeContextManifest = {
  readonly snapshotId?: string | undefined;
  readonly snapshotHash?: string | undefined;
  readonly includedMessageIds?: readonly string[] | undefined;
  readonly history?: JsonObject | undefined;
  readonly budget?: JsonObject | undefined;
};

/**
 * One turn handed from core to runtime.
 *
 * Messages and allowed tools are already chosen. Empty profile/provider/model
 * fields mean "use the runtime defaults."
 */
export type AgentRuntimeRequest = {
  readonly requestId: RequestId;
  readonly assistantTurnId: AssistantTurnId;
  readonly executorId?: ExecutorId | undefined;
  readonly providerId?: ProviderId | undefined;
  readonly modelId?: ModelId | undefined;
  readonly profileId?: ProfileId | undefined;
  readonly systemInstructions?: string | undefined;
  readonly messages: readonly RuntimeMessage[];
  readonly contextBoard?: RuntimeContextBoard | undefined;
  readonly availableToolNames?: readonly string[] | undefined;
  readonly tools?: readonly RuntimeTool[] | undefined;
  readonly toolScope?: RuntimeToolScope | undefined;
  readonly abortSignal?: AbortSignal | undefined;
};

/**
 * What an executor receives after turn setup.
 *
 * Ids, messages, and tools are final for this turn.
 */
export type RuntimeProviderRequest = {
  readonly requestId: RequestId;
  readonly assistantTurnId: AssistantTurnId;
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
  readonly messages: readonly RuntimeMessage[];
  readonly tools?: readonly RuntimeTool[] | undefined;
  readonly toolScope?: RuntimeToolScope | undefined;
  readonly abortSignal?: AbortSignal | undefined;
};
