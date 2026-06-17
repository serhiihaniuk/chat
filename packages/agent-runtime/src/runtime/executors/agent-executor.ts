import type { AiRuntimeEventStream } from "@side-chat/ai-runtime-contract";
import type { RuntimeProviderRequest } from "../turn/runtime-provider-request.js";

export const DEFAULT_AGENT_EXECUTOR_ID = "ai_sdk.tool_loop" as const;

/**
 * Provider artifacts the runtime resolves and hands straight to the executor.
 *
 * `ResolvedProviderModel` is the AI SDK `LanguageModel` and
 * `ResolvedProviderOptions` is the provider's call-options bag. The provider
 * adapter produces them; the runtime and executors pass them through unchanged
 * and never inspect them, so they stay `unknown` here on purpose instead of
 * leaking AI SDK types across the runtime boundary.
 */
export type ResolvedProviderModel = unknown;
export type ResolvedProviderOptions = unknown;

/**
 * AgentExecutionRequest is the last runtime-owned shape before streaming.
 *
 * The runtime has already selected the provider, model handle, messages, and
 * executable tools. Executors may choose how to produce RuntimeEvent values,
 * but they must not reopen product policy or expose provider-native stream
 * parts.
 */
export type AgentExecutionRequest = {
  readonly model: ResolvedProviderModel;
  readonly providerOptions: ResolvedProviderOptions;
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
  readonly stream: (request: AgentExecutionRequest) => AiRuntimeEventStream;
};
