import type { LanguageModel, ToolLoopAgentSettings } from "ai";

import type { HostCommandResolver } from "#tools/runtime-tool";
import { runAiSdkToolLoopAgentStream } from "../ai-sdk/streaming/tool-loop-agent-runner.js";
import {
  DEFAULT_AGENT_EXECUTOR_ID,
  type AgentExecutionRequest,
  type AgentExecutor,
} from "./agent-executor.js";

export type AiSdkToolLoopExecutorOptions = {
  /** Text-batching window in ms passed through to the runner; `0` disables batching. */
  readonly flushIntervalMs?: number | undefined;
  /** Awaits browser-side results for UI (host) tool calls. */
  readonly hostCommandResolver?: HostCommandResolver | undefined;
};

export const createAiSdkToolLoopExecutor = (
  options: AiSdkToolLoopExecutorOptions = {},
): AgentExecutor => ({
  executorId: DEFAULT_AGENT_EXECUTOR_ID,
  description: "Runs a prepared turn through the AI SDK tool-loop agent.",
  stream: (request) =>
    runAiSdkToolLoopAgentStream({
      ...toAiSdkToolLoopOptions(request),
      flushIntervalMs: options.flushIntervalMs,
      hostCommandResolver: options.hostCommandResolver,
    }),
});

const toAiSdkToolLoopOptions = ({
  model,
  providerOptions,
  providerRequest,
}: AgentExecutionRequest) => ({
  model: model as LanguageModel,
  providerOptions: providerOptions as ToolLoopAgentSettings["providerOptions"] | undefined,
  request: providerRequest,
});
