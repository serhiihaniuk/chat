import {
  createModelCallToUIChunkTransform,
  type ModelCallStreamPart,
  type ProviderOptions,
  WorkflowAgent,
  type WorkflowAgentOptions,
  type WorkflowAgentStreamResult,
} from "@ai-sdk/workflow";
import { isStepCount, type ModelMessage, type UIMessage, type UIMessageChunk } from "ai";
import { createHook, getWorkflowMetadata, getWritable, sleep } from "workflow";
import { resumeHook, start } from "workflow/api";

import { assertModelInstance, type ModelProvider } from "#application/ports/model-provider";
import { PRIVATE_TELEMETRY_OPTIONS } from "#application/ports/telemetry-sink";
import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import { initializeProductionWorkflowServices } from "#composition/workflow/production";
import { patchWorkflowRealmAbortSignal } from "../abort-signal-patch.js";

export const CHAT_TURN_OUTCOMES = {
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;

export const CHAT_TURN_ERROR_CODES = {
  MODEL_STREAM_FAILED: "model_stream_failed",
  PROVIDER_TIMEOUT: "provider_timeout",
} as const;

const CHAT_TURN_WORKFLOW = {
  AGENT_ID: "side-chat-turn",
  CANCELLATION_HOOK_PREFIX: "chat-turn-cancel",
  MAX_RETRIES: 0,
  PROVIDER_TIMEOUT_REASON: CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT,
} as const;

export interface SerializableChatMessage {
  readonly role: "assistant" | "user";
  readonly content: string;
}

/** Everything crossing into the workflow realm is plain configuration data. */
export interface ChatTurnWorkflowInput {
  readonly turnId: string;
  readonly requestId: string;
  readonly modelId: string;
  readonly instructions: string;
  readonly maxSteps: number;
  readonly providerTimeoutMs: number;
  readonly messages: readonly SerializableChatMessage[];
  readonly clientTools: readonly ClientToolDefinition[];
}

export type ChatTurnTerminalOutcome =
  | {
      readonly status: typeof CHAT_TURN_OUTCOMES.COMPLETED;
      readonly assistantMessage: UIMessage;
      readonly finishReason: string;
      readonly usage: SerializableUsage;
    }
  | {
      readonly status: typeof CHAT_TURN_OUTCOMES.CANCELLED;
      readonly reason: string;
    }
  | {
      readonly status: typeof CHAT_TURN_OUTCOMES.FAILED;
      readonly code:
        | typeof CHAT_TURN_ERROR_CODES.MODEL_STREAM_FAILED
        | typeof CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT;
    };

export interface StartedChatTurn {
  readonly runId: string;
  readonly stream: ReadableStream<UIMessageChunk>;
  readonly terminal: Promise<ChatTurnTerminalOutcome>;
}

export { replayChatTurn, type ReplayedChatTurn } from "./chat-turn-replay.js";

interface TurnCancellation {
  readonly reason: string;
}

interface SerializableUsage {
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
  readonly totalTokens: number | undefined;
  readonly reasoningTokens: number | undefined;
  readonly cachedInputTokens: number | undefined;
}

type WorkflowAgentContentPart = WorkflowAgentStreamResult["steps"][number]["content"][number];

type CompletedAgentResult = Readonly<{
  steps: readonly Readonly<{ content: readonly WorkflowAgentContentPart[] }>[];
  finishReason: string;
  totalUsage: Readonly<{
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
    inputTokenDetails?: Readonly<{ cacheReadTokens: number | undefined }> | undefined;
    outputTokenDetails?: Readonly<{ reasoningTokens: number | undefined }> | undefined;
  }>;
}>;

export function chatTurnCancellationHookToken(runId: string): string {
  return `${CHAT_TURN_WORKFLOW.CANCELLATION_HOOK_PREFIX}:${runId}`;
}

/** Route-side facade. Workflow handles and engine result objects remain private. */
export async function startChatTurn(input: ChatTurnWorkflowInput): Promise<StartedChatTurn> {
  const run = await start(chatTurnWorkflow, [input]);
  return {
    runId: run.runId,
    stream: run.getReadable<ModelCallStreamPart>().pipeThrough(createModelCallToUIChunkTransform()),
    terminal: run.returnValue,
  };
}

export async function cancelChatTurn(runId: string, reason: string): Promise<boolean> {
  try {
    await resumeHook(chatTurnCancellationHookToken(runId), { reason });
    return true;
  } catch {
    return false;
  }
}

/**
 * The workflow owns one agent invocation and resolves to exactly one JSON-safe
 * terminal outcome. Persistence is deliberately outside this physical lane;
 * the application layer consumes the terminal result and owns idempotency.
 */
export async function chatTurnWorkflow(
  input: ChatTurnWorkflowInput,
): Promise<ChatTurnTerminalOutcome> {
  "use workflow";

  return executeChatTurn(input, initializeProductionWorkflowServices().modelProvider);
}

/** Shared workflow-realm mechanics; production and compiled tests supply different model ports. */
export async function executeChatTurn(
  input: ChatTurnWorkflowInput,
  modelProvider: ModelProvider,
): Promise<ChatTurnTerminalOutcome> {
  const controller = new AbortController();
  patchWorkflowRealmAbortSignal(controller.signal);
  const { workflowRunId } = getWorkflowMetadata();

  const cancellation = createHook<TurnCancellation>({
    token: chatTurnCancellationHookToken(workflowRunId),
  });
  const resolvedModel = modelProvider.modelFor({
    modelId: input.modelId,
    requestId: input.requestId,
  });
  assertModelInstance(resolvedModel.model);

  const agent = new WorkflowAgent(
    createAgentOptions({
      id: CHAT_TURN_WORKFLOW.AGENT_ID,
      model: resolvedModel.model,
      instructions: input.instructions,
      stopWhen: isStepCount(input.maxSteps),
      maxRetries: CHAT_TURN_WORKFLOW.MAX_RETRIES,
      telemetry: PRIVATE_TELEMETRY_OPTIONS,
      providerOptions: resolvedModel.providerOptions,
    }),
  );

  const streamOutcome = agent
    .stream({
      messages: toModelMessages(input.messages),
      writable: getWritable<ModelCallStreamPart>(),
      abortSignal: controller.signal,
    })
    .then(
      (result) => toCompletedChatTurnOutcome(input.turnId, input.maxSteps, result),
      failedOutcome,
    );

  const cancelOutcome = async (): Promise<ChatTurnTerminalOutcome> => {
    const payload = await cancellation;
    controller.abort(payload.reason);
    await streamOutcome;
    return { status: CHAT_TURN_OUTCOMES.CANCELLED, reason: payload.reason };
  };

  const timeoutOutcome = async (): Promise<ChatTurnTerminalOutcome> => {
    await sleep(`${input.providerTimeoutMs}ms`);
    controller.abort(CHAT_TURN_WORKFLOW.PROVIDER_TIMEOUT_REASON);
    await streamOutcome;
    return {
      status: CHAT_TURN_OUTCOMES.FAILED,
      code: CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT,
    };
  };

  return await Promise.race([streamOutcome, cancelOutcome(), timeoutOutcome()]);
}
function toModelMessages(messages: readonly SerializableChatMessage[]): ModelMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export function toCompletedChatTurnOutcome(
  turnId: string,
  maxSteps: number,
  result: CompletedAgentResult,
): ChatTurnTerminalOutcome {
  return {
    status: CHAT_TURN_OUTCOMES.COMPLETED,
    assistantMessage: toAssistantMessage(turnId, result),
    finishReason: finishReasonFor(result, maxSteps),
    usage: {
      inputTokens: result.totalUsage.inputTokens,
      outputTokens: result.totalUsage.outputTokens,
      totalTokens: result.totalUsage.totalTokens,
      reasoningTokens: result.totalUsage.outputTokenDetails?.reasoningTokens,
      cachedInputTokens: result.totalUsage.inputTokenDetails?.cacheReadTokens,
    },
  };
}

function toAssistantMessage(turnId: string, result: CompletedAgentResult): UIMessage {
  const content = result.steps.at(-1)?.content ?? [];
  const parts: UIMessage["parts"] = [];
  for (const part of content) {
    if (part.type === "text") parts.push({ type: "text", text: part.text });
    if (part.type === "reasoning") parts.push({ type: "reasoning", text: part.text });
  }
  return {
    id: `${turnId}-assistant`,
    role: "assistant",
    parts,
  };
}

function finishReasonFor(result: CompletedAgentResult, maxSteps: number): string {
  const stoppedAtStepLimit =
    result.finishReason === "tool-calls" && result.steps.length >= maxSteps;
  return stoppedAtStepLimit ? "length" : result.finishReason;
}

function failedOutcome(error: unknown): ChatTurnTerminalOutcome {
  if (error instanceof DOMException && error.name === "AbortError") {
    if (error.message === CHAT_TURN_WORKFLOW.PROVIDER_TIMEOUT_REASON) {
      return {
        status: CHAT_TURN_OUTCOMES.FAILED,
        code: CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT,
      };
    }
    return { status: CHAT_TURN_OUTCOMES.CANCELLED, reason: error.message };
  }
  return {
    status: CHAT_TURN_OUTCOMES.FAILED,
    code: CHAT_TURN_ERROR_CODES.MODEL_STREAM_FAILED,
  };
}

function createAgentOptions(options: {
  readonly id: string;
  readonly model: WorkflowAgentOptions["model"];
  readonly instructions: string;
  readonly stopWhen: NonNullable<WorkflowAgentOptions["stopWhen"]>;
  readonly maxRetries: number;
  readonly telemetry: typeof PRIVATE_TELEMETRY_OPTIONS;
  readonly providerOptions: ProviderOptions | undefined;
}): WorkflowAgentOptions {
  const agentOptions: WorkflowAgentOptions = {
    id: options.id,
    model: options.model,
    instructions: options.instructions,
    stopWhen: options.stopWhen,
    maxRetries: options.maxRetries,
    telemetry: options.telemetry,
  };
  if (options.providerOptions !== undefined) {
    agentOptions.providerOptions = options.providerOptions;
  }
  return agentOptions;
}
