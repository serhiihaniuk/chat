import type {
  AiRuntimeEventStream,
  AiRuntimeMessage,
  AiRuntimeRequest,
} from "@side-chat/ai-runtime-contract";
import type { AgentRuntime } from "../agent-runtime.js";

export type BasicRuntimeAgentDefaults = Pick<
  AiRuntimeRequest,
  "executorId" | "modelId" | "providerId" | "toolScope"
> & {
  readonly toolNames?: readonly string[] | undefined;
  readonly systemInstructions?: string | undefined;
};

export type BasicRuntimeAgentInput = {
  readonly requestId: AiRuntimeRequest["requestId"];
  readonly assistantTurnId: AiRuntimeRequest["assistantTurnId"];
  readonly messages: readonly AiRuntimeMessage[];
  readonly abortSignal?: AbortSignal | undefined;
  readonly systemInstructions?: string | undefined;
};

export type BasicRuntimeAgent = {
  readonly streamEffect: (input: BasicRuntimeAgentInput) => AiRuntimeEventStream;
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
  defaults: BasicRuntimeAgentDefaults,
): BasicRuntimeAgent => ({
  streamEffect: (input) =>
    runtime.streamEffect({
      requestId: input.requestId,
      assistantTurnId: input.assistantTurnId,
      executorId: defaults.executorId,
      providerId: defaults.providerId,
      modelId: defaults.modelId,
      messages: createBasicRuntimeMessages(
        input.systemInstructions ?? defaults.systemInstructions,
        input.messages,
      ),
      toolNames: defaults.toolNames ?? [],
      toolScope: defaults.toolScope,
      abortSignal: input.abortSignal,
    }),
});

const createBasicRuntimeMessages = (
  systemInstructions: string | undefined,
  messages: readonly AiRuntimeMessage[],
): readonly AiRuntimeMessage[] => {
  if (!systemInstructions?.trim()) return messages;
  return [{ role: "system", content: systemInstructions }, ...messages];
};
