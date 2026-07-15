import {
  createModelCallToUIChunkTransform,
  type ModelCallStreamPart,
  type WorkflowAgent,
  type WorkflowAgentStreamResult,
} from "@ai-sdk/workflow";
import type { UIMessageChunk } from "ai";
import { createHook, getWorkflowMetadata, getWritable } from "workflow";

import { assertDurableModelHandle, type ModelProvider } from "#application/ports/model-provider";
import { TURN_CLAIM_DISPOSITIONS } from "#application/ports/turn/turn-store";
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
  shouldDeferChatTurnStreamFailure,
  withVisibleAssistantMessage,
  type ChatTurnTerminalOutcome,
} from "./outcome/chat-turn-outcome.js";
import { toCompletedChatTurnOutcome } from "./outcome/completed-chat-turn-outcome.js";
import { createClientTools, preserveDynamicClientToolIdentity } from "./client-tools/index.js";
import { runChatTurnFinalizeStep } from "./production/chat-turn-finalize.js";
import { claimChatTurnExecution, resolveRejectedChatTurnClaim } from "./execution-claim.js";
import { readVisibleAssistantMessageStep } from "./production/stream/chat-turn-visible-message.js";
import { createSuspendableTurnTimeout } from "./timeout/turn-timeout.js";
import { createServerTools, type ApprovalWorkflowStreamPart } from "./server-tools/index.js";
import type { ChatTurnWorkflowInput } from "./input/chat-turn-input.js";
import { normalizeApprovalUIChunk } from "./tool-approvals/approval-output.js";
import { createChatTurnAgent, toChatTurnModelMessages } from "./chat-turn-agent.js";

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

  const initialClaim = await claimChatTurnExecution(databaseUrl, input, workflowRunId);
  if (initialClaim !== TURN_CLAIM_DISPOSITIONS.EXECUTE) {
    return await resolveRejectedChatTurnClaim(initialClaim, databaseUrl, input, finalizeChatTurn);
  }

  const cancellation = createHook<TurnCancellation>({
    token: chatTurnCancellationHookToken(workflowRunId),
  });
  const providerClaim = await claimChatTurnExecution(databaseUrl, input, workflowRunId);
  if (providerClaim !== TURN_CLAIM_DISPOSITIONS.EXECUTE) {
    return await resolveRejectedChatTurnClaim(providerClaim, databaseUrl, input, finalizeChatTurn);
  }
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

  const agent = createChatTurnAgent({
    id: CHAT_TURN_WORKFLOW.AGENT_ID,
    model: resolvedModel.model,
    instructions: input.instructions,
    maxSteps: input.maxSteps,
    maxRetries: CHAT_TURN_WORKFLOW.MAX_RETRIES,
    providerOptions: resolvedModel.providerOptions,
    clientTools,
    serverTools,
  });

  const terminalOutcome = await raceChatTurnOutcome(
    agent,
    controller,
    cancellation,
    providerTimeout,
    writable,
    input,
  );
  const outcome = await foldVisibleAssistantMessage(
    workflowRunId,
    input.turnId,
    input.clientTools,
    terminalOutcome,
  );
  if (databaseUrl !== undefined) {
    await finalizeChatTurn(databaseUrl, input, outcome);
  }
  return outcome;
}

/**
 * Make the closed workflow journal the visible-message authority at terminal.
 * The final provider result still supplies status, finish reason, and usage.
 */
async function foldVisibleAssistantMessage(
  runId: string,
  turnId: string,
  clientTools: readonly ClientToolDefinition[],
  outcome: ChatTurnTerminalOutcome,
): Promise<ChatTurnTerminalOutcome> {
  const visibleMessage = await readVisibleAssistantMessageStep(runId, turnId, clientTools);
  return withVisibleAssistantMessage(outcome, visibleMessage);
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
      messages: toChatTurnModelMessages(input.messages),
      writable,
      abortSignal: controller.signal,
    })
    .then(
      (result): SettledStream => ({ kind: "completed", result }),
      (error): SettledStream => ({ kind: "failed", error }),
    );

  const streamOutcome = streamSettled.then((settled) =>
    resolveSettledStream(
      settled,
      input,
      Math.max(0, Date.now() - activityStartedAt),
      controller.signal.aborted,
    ),
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
  controllerAbortRequested: boolean,
): ChatTurnTerminalOutcome | Promise<never> {
  if (settled.kind === "completed") {
    return toCompletedChatTurnOutcome(
      input.turnId,
      input.maxSteps,
      activityDurationMs,
      settled.result,
    );
  }
  if (shouldDeferChatTurnStreamFailure(settled.error, controllerAbortRequested)) {
    return DEFERRED_OUTCOME;
  }
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
  assistantMessageId: string,
): ReadableStream<UIMessageChunk> {
  return stream
    .pipeThrough(createModelCallToUIChunkTransform())
    .pipeThrough(stampAssistantMessageId(assistantMessageId))
    .pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform: (chunk, controller) => controller.enqueue(normalizeApprovalUIChunk(chunk)),
      }),
    )
    .pipeThrough(preserveDynamicClientToolIdentity(clientTools));
}

/** Give every attachment epoch the same durable assistant identity. */
export function stampAssistantMessageId(
  assistantMessageId: string,
): TransformStream<UIMessageChunk, UIMessageChunk> {
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(
        chunk.type === "start" ? { ...chunk, messageId: assistantMessageId } : chunk,
      );
    },
  });
}
