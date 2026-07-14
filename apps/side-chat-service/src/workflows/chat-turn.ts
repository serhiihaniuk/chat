import {
  createModelCallToUIChunkTransform,
  type ModelCallStreamPart,
  type ProviderOptions,
  WorkflowAgent,
  type WorkflowAgentOptions,
  type WorkflowAgentStreamResult,
} from "@ai-sdk/workflow";
import { isStepCount, type ModelMessage, type ToolSet, type UIMessageChunk } from "ai";
import { createHook, getWorkflowMetadata, getWritable } from "workflow";

import { assertDurableModelHandle, type ModelProvider } from "#application/ports/model-provider";
import { PRIVATE_TELEMETRY_OPTIONS } from "#application/ports/telemetry-sink";
import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import {
  selectServerToolDefinitions,
  type ServerToolDefinition,
} from "#application/turn/tools/server-tools/server-tool-catalog";
import { patchWorkflowRealmAbortSignal } from "./realm/abort-signal-patch.js";
import {
  ABORT_ERROR_NAME,
  CHAT_TURN_ERROR_CODES,
  CHAT_TURN_OUTCOMES,
  chatTurnFinalization,
  failedChatTurnOutcome,
  isChatTurnAbortError,
  toCompletedChatTurnOutcome,
  type ChatTurnTerminalOutcome,
} from "./chat-turn-outcome.js";
import { createClientTools, preserveDynamicClientToolIdentity } from "./client-tools/index.js";
import { runChatTurnFinalizeStep } from "./production/chat-turn-finalize.js";
import { createSuspendableTurnTimeout } from "./timeout/turn-timeout.js";
import { createServerTools, type ApprovalWorkflowStreamPart } from "./server-tools/index.js";
import {
  type ChatTurnWorkflowInput,
  type SerializableChatMessage,
} from "./input/chat-turn-input.js";
import { normalizeApprovalUIChunk } from "./tool-approvals/approval-output.js";

export type { ChatTurnWorkflowInput, SerializableChatMessage } from "./input/chat-turn-input.js";

const CHAT_TURN_WORKFLOW = {
  AGENT_ID: "side-chat-turn",
  CANCELLATION_HOOK_PREFIX: "chat-turn-cancel",
  MAX_RETRIES: 0,
  PROVIDER_TIMEOUT_REASON: CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT,
} as const;

/**
 * Excludes an aborted stream from the terminal race. The cancel or timeout arm
 * that requested the abort is the authority, so the aborted `agent.stream`
 * rejection must not resolve the race and misclassify the outcome.
 */
const DEFERRED_OUTCOME: Promise<never> = new Promise(() => {
  // Intentionally never settles.
});

export interface StartedChatTurn {
  readonly runId: string;
  readonly stream: ReadableStream<UIMessageChunk>;
  readonly terminal: Promise<ChatTurnTerminalOutcome>;
}

interface TurnCancellation {
  readonly reason: string;
}

type SettledStream =
  | Readonly<{ kind: "completed"; result: WorkflowAgentStreamResult }>
  | Readonly<{ kind: "failed"; error: unknown }>;

export function chatTurnCancellationHookToken(runId: string): string {
  return `${CHAT_TURN_WORKFLOW.CANCELLATION_HOOK_PREFIX}:${runId}`;
}

/** Shared workflow-realm mechanics; wrappers supply their own model port. */
export async function executeChatTurn(
  input: ChatTurnWorkflowInput,
  modelProvider: ModelProvider,
  serverToolDefinitions: readonly ServerToolDefinition[],
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
    ...(input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort }),
  });
  assertDurableModelHandle(resolvedModel.model);
  const providerTimeout = createSuspendableTurnTimeout(input.providerTimeoutMs);
  const writable = getWritable<ApprovalWorkflowStreamPart>();
  const clientTools = createClientTools({
    definitions: input.clientTools,
    runId: workflowRunId,
    databaseUrl,
    workspaceId: input.workspaceId,
    turnId: input.turnId,
    timeoutMs: input.clientToolTimeoutMs,
    abortSignal: controller.signal,
  });
  const serverTools = createServerTools({
    definitions: selectServerToolDefinitions(serverToolDefinitions, input.enabledToolNames),
    databaseUrl,
    workspaceId: input.workspaceId,
    subjectId: input.subjectId,
    conversationId: input.conversationId,
    turnId: input.turnId,
    runId: workflowRunId,
    providerTimeout,
    abortSignal: controller.signal,
  });

  const agent = new WorkflowAgent(
    createAgentOptions({
      id: CHAT_TURN_WORKFLOW.AGENT_ID,
      model: resolvedModel.model,
      instructions: input.instructions,
      stopWhen: isStepCount(input.maxSteps),
      maxRetries: CHAT_TURN_WORKFLOW.MAX_RETRIES,
      telemetry: PRIVATE_TELEMETRY_OPTIONS,
      providerOptions: resolvedModel.providerOptions,
      tools: mergeToolSets(clientTools, serverTools),
    }),
  );

  const outcome = await raceChatTurnOutcome(
    agent,
    controller,
    cancellation,
    providerTimeout,
    writable,
    input,
  );
  if (databaseUrl !== undefined) {
    await finalizeChatTurn(databaseUrl, input, outcome);
  }
  return outcome;
}

/**
 * Resolve exactly one terminal outcome. A completion or a non-abort failure wins
 * directly; an aborted stream defers to the cancel or timeout arm that requested
 * it, so the result is order-independent and does not depend on the abort message
 * surviving the provider boundary.
 */
async function raceChatTurnOutcome(
  agent: WorkflowAgent,
  controller: AbortController,
  cancellation: PromiseLike<TurnCancellation>,
  providerTimeout: ReturnType<typeof createSuspendableTurnTimeout>,
  writable: WritableStream<ApprovalWorkflowStreamPart>,
  input: ChatTurnWorkflowInput,
): Promise<ChatTurnTerminalOutcome> {
  const activityStartedAt = Date.now();
  const streamSettled = agent
    .stream({
      messages: toModelMessages(input.messages),
      writable,
      abortSignal: controller.signal,
    })
    .then(
      (result): SettledStream => ({ kind: "completed", result }),
      (error): SettledStream => ({ kind: "failed", error }),
    );

  const streamOutcome = streamSettled.then((settled) =>
    resolveSettledStream(settled, input, Math.max(0, Date.now() - activityStartedAt)),
  );

  const cancelOutcome = async (): Promise<ChatTurnTerminalOutcome> => {
    const payload = await cancellation;
    controller.abort(new DOMException(payload.reason, ABORT_ERROR_NAME));
    await streamSettled;
    return { status: CHAT_TURN_OUTCOMES.CANCELLED, reason: payload.reason };
  };

  const timeoutOutcome = async (): Promise<ChatTurnTerminalOutcome> => {
    await providerTimeout.waitUntilElapsed();
    controller.abort(
      new DOMException(CHAT_TURN_WORKFLOW.PROVIDER_TIMEOUT_REASON, ABORT_ERROR_NAME),
    );
    await streamSettled;
    return {
      status: CHAT_TURN_OUTCOMES.FAILED,
      code: CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT,
    };
  };

  return await Promise.race([streamOutcome, cancelOutcome(), timeoutOutcome()]);
}

function resolveSettledStream(
  settled: SettledStream,
  input: ChatTurnWorkflowInput,
  activityDurationMs: number,
): ChatTurnTerminalOutcome | Promise<never> {
  if (settled.kind === "completed") {
    return toCompletedChatTurnOutcome(
      input.turnId,
      input.maxSteps,
      activityDurationMs,
      settled.result,
    );
  }
  if (isChatTurnAbortError(settled.error)) return DEFERRED_OUTCOME;
  return failedChatTurnOutcome();
}

/** Durably persist the terminal inside the workflow so a route crash cannot strand it. */
function finalizeChatTurn(
  databaseUrl: string,
  input: ChatTurnWorkflowInput,
  outcome: ChatTurnTerminalOutcome,
): Promise<void> {
  return runChatTurnFinalizeStep({
    databaseUrl,
    identity: {
      conversationId: input.conversationId,
      turnId: input.turnId,
      workspaceId: input.workspaceId,
      subjectId: input.subjectId,
    },
    finalization: chatTurnFinalization(outcome),
  });
}

export function toChatTurnUIStream(
  stream: ReadableStream<ModelCallStreamPart>,
  clientTools: readonly ClientToolDefinition[],
): ReadableStream<UIMessageChunk> {
  return stream
    .pipeThrough(createModelCallToUIChunkTransform())
    .pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform: (chunk, controller) => controller.enqueue(normalizeApprovalUIChunk(chunk)),
      }),
    )
    .pipeThrough(preserveDynamicClientToolIdentity(clientTools));
}

function mergeToolSets(clientTools: ToolSet, serverTools: ToolSet): ToolSet {
  const duplicate = Object.keys(clientTools).find((name) => name in serverTools);
  if (duplicate !== undefined) throw new Error(`Duplicate client/server tool name: ${duplicate}`);
  return { ...clientTools, ...serverTools };
}

function toModelMessages(messages: readonly SerializableChatMessage[]): ModelMessage[] {
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
