import type { UIMessageChunk } from "ai";
import { createHook, getWorkflowMetadata, getWritable } from "workflow";

import { assertDurableModelHandle, type ModelProvider } from "#application/ports/model-provider";
import { TURN_CLAIM_DISPOSITIONS } from "#application/ports/turn/turn-store";
import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import {
  selectServerToolDefinitions,
  type ServerToolDefinition,
} from "@side-chat/side-chat-server";
import { patchWorkflowRealmAbortSignal } from "./realm/abort-signal-patch.js";
import type { ChatTurnJournalPart } from "./journal/chat-turn-journal.js";
import {
  CHAT_TURN_OUTCOMES,
  chatTurnFinalization,
  failedChatTurnOutcome,
  withVisibleAssistantMessage,
  type ChatTurnTerminalOutcome,
} from "./outcome/chat-turn-outcome.js";
import { raceChatTurnOutcome } from "./outcome/race/chat-turn-outcome-race.js";
import { createClientTools } from "./client-tools/index.js";
import { runChatTurnFinalizeStep } from "./production/chat-turn-finalize.js";
import { claimChatTurnExecution, resolveRejectedChatTurnClaim } from "./execution-claim.js";
import { readChatTurnJournalProjectionStep } from "./production/stream/chat-turn-visible-message.js";
import { createSuspendableTurnTimeout } from "./timeout/turn-timeout.js";
import { createServerTools } from "./server-tools/index.js";
import type { ChatTurnWorkflowInput } from "./input/chat-turn-input.js";
import { createChatTurnAgent } from "./agent/chat-turn-agent.js";

export type { ChatTurnWorkflowInput, SerializableChatMessage } from "./input/chat-turn-input.js";
export { stampAssistantMessageId, toChatTurnUIStream } from "./journal/chat-turn-ui-stream.js";

const CHAT_TURN_WORKFLOW = {
  AGENT_ID: "side-chat-turn",
  CANCELLATION_HOOK_PREFIX: "chat-turn-cancel",
  MAX_RETRIES: 0,
} as const;

export interface StartedChatTurn {
  readonly runId: string;
  readonly stream: ReadableStream<UIMessageChunk>;
  readonly terminal: Promise<ChatTurnTerminalOutcome>;
}

export type ChatTurnExecutionDependencies = Readonly<{
  workflowRunId: () => string;
  claimExecution: typeof claimChatTurnExecution;
  resolveRejectedClaim: typeof resolveRejectedChatTurnClaim;
  createCancellationHook: (token: string) => PromiseLike<Readonly<{ reason: string }>>;
  createAgent: typeof createChatTurnAgent;
  closeJournal?: () => Promise<void>;
}>;

const DEFAULT_CHAT_TURN_EXECUTION_DEPENDENCIES: ChatTurnExecutionDependencies = {
  workflowRunId: () => getWorkflowMetadata().workflowRunId,
  claimExecution: claimChatTurnExecution,
  resolveRejectedClaim: resolveRejectedChatTurnClaim,
  createCancellationHook: (token) => createHook<Readonly<{ reason: string }>>({ token }),
  createAgent: createChatTurnAgent,
};

export function chatTurnCancellationHookToken(runId: string): string {
  return `${CHAT_TURN_WORKFLOW.CANCELLATION_HOOK_PREFIX}:${runId}`;
}

/** Shared workflow-realm mechanics; wrappers supply their own model port. */
export async function executeChatTurn(
  input: ChatTurnWorkflowInput,
  modelProvider: ModelProvider,
  serverToolDefinitions: readonly ServerToolDefinition[],
  databaseUrl?: string,
  dependencies: ChatTurnExecutionDependencies = DEFAULT_CHAT_TURN_EXECUTION_DEPENDENCIES,
): Promise<ChatTurnTerminalOutcome> {
  const controller = new AbortController();
  patchWorkflowRealmAbortSignal(controller.signal);
  const workflowRunId = dependencies.workflowRunId();

  const initialClaim = await dependencies.claimExecution(databaseUrl, input, workflowRunId);
  if (initialClaim !== TURN_CLAIM_DISPOSITIONS.EXECUTE) {
    const outcome = await dependencies.resolveRejectedClaim(
      initialClaim,
      databaseUrl,
      input,
      finalizeChatTurn,
    );
    await closeJournalForExecution(dependencies);
    return outcome;
  }

  const cancellation = dependencies.createCancellationHook(
    chatTurnCancellationHookToken(workflowRunId),
  );
  const providerClaim = await dependencies.claimExecution(databaseUrl, input, workflowRunId);
  if (providerClaim !== TURN_CLAIM_DISPOSITIONS.EXECUTE) {
    const outcome = await dependencies.resolveRejectedClaim(
      providerClaim,
      databaseUrl,
      input,
      finalizeChatTurn,
    );
    await closeJournalForExecution(dependencies);
    return outcome;
  }
  const resolvedModel = modelProvider.modelFor({
    modelId: input.modelId,
    requestId: input.requestId,
    ...(input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort }),
  });
  assertDurableModelHandle(resolvedModel.model);
  const providerTimeout = createSuspendableTurnTimeout(input.providerTimeoutMs);
  const writable = getWritable<ChatTurnJournalPart>();
  const clientTools = createClientTools({
    definitions: input.clientTools,
    clientToolCapabilityDigest: input.clientToolCapabilityDigest,
    runId: workflowRunId,
    databaseUrl,
    workspaceId: input.actor.workspaceId,
    turnId: input.turnId,
    timeoutMs: input.clientToolTimeoutMs,
    abortSignal: controller.signal,
  });
  const serverTools = createServerTools({
    definitions: selectServerToolDefinitions(serverToolDefinitions, input.enabledToolNames),
    databaseUrl,
    actor: input.actor,
    conversationId: input.conversationId,
    turnId: input.turnId,
    runId: workflowRunId,
    providerTimeout,
    abortSignal: controller.signal,
  });

  const agent = dependencies.createAgent({
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
  await closeJournalForExecution(dependencies);
  const outcome = await foldChatTurnJournalProjection(
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

/** Ensure a recovered or aborted provider step cannot leave replay subscribers waiting forever. */
async function closeChatTurnJournal(): Promise<void> {
  "use step";

  await getWritable<ChatTurnJournalPart>().close();
}

function closeJournalForExecution(dependencies: ChatTurnExecutionDependencies): Promise<void> {
  return dependencies.closeJournal === undefined
    ? closeChatTurnJournal()
    : dependencies.closeJournal();
}

/**
 * The closed Workflow journal receives raw provider parts and becomes the source
 * for visible output and explicit stream failures. The provider result still
 * supplies successful finish reason and usage, but `other` cannot distinguish an
 * error-only stream.
 */
async function foldChatTurnJournalProjection(
  runId: string,
  turnId: string,
  clientTools: readonly ClientToolDefinition[],
  outcome: ChatTurnTerminalOutcome,
): Promise<ChatTurnTerminalOutcome> {
  const projection = await readChatTurnJournalProjectionStep(runId, turnId, clientTools);
  const classifiedOutcome =
    outcome.status === CHAT_TURN_OUTCOMES.COMPLETED && projection.providerFailed
      ? failedChatTurnOutcome()
      : outcome;
  return withVisibleAssistantMessage(classifiedOutcome, projection.assistantMessage);
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
      workspaceId: input.actor.workspaceId,
      subjectId: input.actor.subjectId,
    },
    finalization: chatTurnFinalization(outcome),
  });
}
