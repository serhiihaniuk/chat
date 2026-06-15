import type { AgentRuntime } from "../agent-runtime.js";
import type { AgentRuntimeRequest, RuntimeMessage } from "../contract/runtime-request.js";
import type { RuntimeEventStream } from "../contract/runtime-stream.js";

export type BasicRuntimeAgentDefaults = Pick<
  AgentRuntimeRequest,
  "availableToolNames" | "executorId" | "modelId" | "profileId" | "providerId" | "toolScope"
> & {
  readonly systemInstructions?: string | undefined;
};

export type BasicRuntimeAgentInput = {
  readonly requestId: AgentRuntimeRequest["requestId"];
  readonly assistantTurnId: AgentRuntimeRequest["assistantTurnId"];
  readonly messages: readonly RuntimeMessage[];
  readonly abortSignal?: AbortSignal | undefined;
  readonly systemInstructions?: string | undefined;
};

export type BasicRuntimeAgent = {
  readonly streamEffect: (input: BasicRuntimeAgentInput) => RuntimeEventStream;
};

/**
 * Build a minimal model-only agent for small service-owned jobs.
 *
 * Runtime still owns provider/model/tool validation. The caller owns the job
 * prompt and messages, while this wrapper keeps ids, defaults, and no-tools
 * behavior consistent for classifiers, safety checks, and title generation.
 */
export const createBasicRuntimeAgent = (
  runtime: AgentRuntime,
  defaults: BasicRuntimeAgentDefaults = {},
): BasicRuntimeAgent => ({
  streamEffect: (input) =>
    runtime.streamEffect({
      requestId: input.requestId,
      assistantTurnId: input.assistantTurnId,
      executorId: defaults.executorId,
      providerId: defaults.providerId,
      modelId: defaults.modelId,
      profileId: defaults.profileId,
      systemInstructions: input.systemInstructions ?? defaults.systemInstructions,
      messages: input.messages,
      availableToolNames: defaults.availableToolNames ?? [],
      toolScope: defaults.toolScope,
      abortSignal: input.abortSignal,
    }),
});
