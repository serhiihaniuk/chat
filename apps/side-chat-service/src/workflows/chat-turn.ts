import {
  createModelCallToUIChunkTransform,
  type ModelCallStreamPart,
  type ProviderOptions,
  WorkflowAgent,
  type WorkflowAgentOptions,
  type WorkflowAgentStreamResult,
} from "@ai-sdk/workflow";
import { isStepCount, type ModelMessage, type ToolSet, type UIMessageChunk } from "ai";
import { createHook, getWorkflowMetadata, getWritable, sleep } from "workflow";

import { assertModelInstance, type ModelProvider } from "#application/ports/model-provider";
import { PRIVATE_TELEMETRY_OPTIONS } from "#application/ports/telemetry-sink";
import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
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

export interface SerializableChatMessage {
  readonly role: "assistant" | "user";
  readonly content: string;
}

/** Everything crossing into the workflow realm is plain configuration data. */
export interface ChatTurnWorkflowInput {
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly conversationId: string;
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

  const outcome = await raceChatTurnOutcome(agent, controller, cancellation, input);
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
  input: ChatTurnWorkflowInput,
): Promise<ChatTurnTerminalOutcome> {
  const streamSettled = agent
    .stream({
      messages: toModelMessages(input.messages),
      writable: getWritable<ModelCallStreamPart>(),
      abortSignal: controller.signal,
    })
    .then(
      (result): SettledStream => ({ kind: "completed", result }),
      (error): SettledStream => ({ kind: "failed", error }),
    );

  const streamOutcome = streamSettled.then((settled) => resolveSettledStream(settled, input));

  const cancelOutcome = async (): Promise<ChatTurnTerminalOutcome> => {
    const payload = await cancellation;
    controller.abort(new DOMException(payload.reason, ABORT_ERROR_NAME));
    await streamSettled;
    return { status: CHAT_TURN_OUTCOMES.CANCELLED, reason: payload.reason };
  };

  const timeoutOutcome = async (): Promise<ChatTurnTerminalOutcome> => {
    await sleep(`${input.providerTimeoutMs}ms`);
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
): ChatTurnTerminalOutcome | Promise<never> {
  if (settled.kind === "completed") {
    return toCompletedChatTurnOutcome(input.turnId, input.maxSteps, settled.result);
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
    .pipeThrough(preserveDynamicClientToolIdentity(clientTools));
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
