import type { LanguageModel, ToolLoopAgentSettings } from "ai";

import { runAiSdkToolLoopAgentStream } from "../ai-sdk/tool-loop-agent-runner.js";
import {
  DEFAULT_AGENT_EXECUTOR_ID,
  type AgentExecutionRequest,
  type AgentExecutor,
} from "./agent-executor.js";

export const createAiSdkToolLoopExecutor = (): AgentExecutor => ({
  executorId: DEFAULT_AGENT_EXECUTOR_ID,
  description: "Runs a prepared turn through the AI SDK tool-loop agent.",
  stream: (request) => runAiSdkToolLoopAgentStream(toAiSdkToolLoopOptions(request)),
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
