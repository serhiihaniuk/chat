import type { RuntimeProviderRequest } from "../contract/runtime-request.js";
import type { RuntimeEventStream } from "../contract/runtime-stream.js";

export const DEFAULT_AGENT_EXECUTOR_ID = "ai_sdk.tool_loop" as const;

/**
 * AgentExecutionRequest is the last runtime-owned shape before streaming.
 *
 * The runtime has already selected the profile, provider, model handle, prompt,
 * and tools. Executors may choose how to produce RuntimeEvent values, but they
 * must not reopen product policy or expose provider-native stream parts.
 */
export type AgentExecutionRequest = {
  readonly model: unknown;
  readonly providerOptions: unknown;
  readonly providerRequest: RuntimeProviderRequest;
};

/**
 * Pluggable runner for one prepared assistant turn.
 *
 * The runtime chooses the model, messages, and tools before calling an
 * executor. The executor's job is only to produce RuntimeEvents.
 */
export type AgentExecutor = {
  readonly executorId: string;
  readonly description: string;
  readonly stream: (request: AgentExecutionRequest) => RuntimeEventStream;
};
