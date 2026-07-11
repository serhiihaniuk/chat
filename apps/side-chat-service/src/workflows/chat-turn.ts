import {
  createModelCallToUIChunkTransform,
  type ModelCallStreamPart,
  type ProviderOptions,
  WorkflowAgent,
  type WorkflowAgentOptions,
} from "@ai-sdk/workflow";
import {
  isStepCount,
  type ModelMessage,
  type ToolSet,
  type UIMessageChunk,
} from "ai";
import { createHook, getWorkflowMetadata, getWritable, sleep } from "workflow";

import {
  assertModelInstance,
  type ModelProvider,
} from "#application/ports/model-provider";
import { PRIVATE_TELEMETRY_OPTIONS } from "#application/ports/telemetry-sink";
import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import { patchWorkflowRealmAbortSignal } from "./abort-signal-patch.js";
import {
  CHAT_TURN_ERROR_CODES,
  CHAT_TURN_OUTCOMES,
  failedChatTurnOutcome,
  toCompletedChatTurnOutcome,
  type ChatTurnTerminalOutcome,
} from "./chat-turn-outcome.js";
import {
  createClientTools,
  preserveDynamicClientToolIdentity,
} from "./client-tools/index.js";

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
  readonly workspaceId: string;
  readonly turnId: string;
  readonly requestId: string;
  readonly modelId: string;
  readonly instructions: string;
  readonly maxSteps: number;
  readonly providerTimeoutMs: number;
  readonly clientToolTimeoutMs: number;
  readonly messages: readonly SerializableChatMessage[];
  readonly clientTools: readonly ClientToolDefinition[];
}

export interface StartedChatTurn {
  readonly runId: string;
  readonly stream: ReadableStream<UIMessageChunk>;
  readonly terminal: Promise<ChatTurnTerminalOutcome>;
}

interface TurnCancellation {
  readonly reason: string;
}

export function chatTurnCancellationHookToken(runId: string): string {
  return `${CHAT_TURN_WORKFLOW.CANCELLATION_HOOK_PREFIX}:${runId}`;
}

/** Shared workflow-realm mechanics; wrappers supply their own model port. */
export async function executeChatTurn(
  input: ChatTurnWorkflowInput,
  modelProvider: ModelProvider,
  databaseUrl?: string,
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
      tools: createClientTools({
        definitions: input.clientTools,
        runId: workflowRunId,
        databaseUrl,
        workspaceId: input.workspaceId,
        turnId: input.turnId,
        timeoutMs: input.clientToolTimeoutMs,
        abortSignal: controller.signal,
      }),
    }),
  );

  const streamOutcome = agent
    .stream({
      messages: toModelMessages(input.messages),
      writable: getWritable<ModelCallStreamPart>(),
      abortSignal: controller.signal,
    })
    .then(
      (result) =>
        toCompletedChatTurnOutcome(input.turnId, input.maxSteps, result),
      failedChatTurnOutcome,
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

export function toChatTurnUIStream(
  stream: ReadableStream<ModelCallStreamPart>,
  clientTools: readonly ClientToolDefinition[],
): ReadableStream<UIMessageChunk> {
  return stream
    .pipeThrough(createModelCallToUIChunkTransform())
    .pipeThrough(preserveDynamicClientToolIdentity(clientTools));
}

function toModelMessages(
  messages: readonly SerializableChatMessage[],
): ModelMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function createAgentOptions(options: {
  readonly id: string;
  readonly model: WorkflowAgentOptions["model"];
  readonly instructions: string;
  readonly stopWhen: NonNullable<WorkflowAgentOptions["stopWhen"]>;
  readonly maxRetries: number;
  readonly telemetry: typeof PRIVATE_TELEMETRY_OPTIONS;
  readonly providerOptions: ProviderOptions | undefined;
  readonly tools: ToolSet;
}): WorkflowAgentOptions {
  const agentOptions: WorkflowAgentOptions = {
    id: options.id,
    model: options.model,
    instructions: options.instructions,
    stopWhen: options.stopWhen,
    maxRetries: options.maxRetries,
    telemetry: options.telemetry,
    tools: options.tools,
  };
  if (options.providerOptions !== undefined) {
    agentOptions.providerOptions = options.providerOptions;
  }
  return agentOptions;
}
