import type { UIMessage, UIMessageChunk } from "ai";

import {
  startConversationTitleGeneration,
  type ConversationTitleDependencies,
} from "#application/conversations/generate-conversation-title";
import type {
  StartedTurnExecution,
  TurnExecutionTerminal,
} from "#application/ports/turn/turn-execution";
import { TURN_EXECUTION_ERROR_CODES, TURN_TERMINAL_STATUSES } from "#domain/turn/turn";

import { finalizeTurn, type FinalizeTurnDependencies } from "../finalization/finalize-turn.js";
import {
  prepareTurn,
  type PrepareTurnDependencies,
  type PrepareTurnInput,
  type PreparedTurn,
} from "./prepare-turn.js";

export type RunTurnDependencies = PrepareTurnDependencies &
  Readonly<{
    titleGeneration?:
      | (ConversationTitleDependencies & Readonly<{ modelId: string; timeoutMs: number }>)
      | undefined;
    /**
     * Present only for the in-memory dev store, whose workflow bundle runs in a
     * separate process the route cannot reach, so the route finalizes the terminal
     * itself. Durable Postgres leaves that to the workflow, so this is absent.
     */
    routeFinalization?: FinalizeTurnDependencies | undefined;
  }>;

export type RunningTurn = Readonly<{
  runId: string;
  stream: ReadableStream<UIMessageChunk>;
}>;

/**
 * Owns a turn from preparation until its client stream closes. The durable terminal
 * write lives in the workflow, so this route lane only releases admission and
 * starts title enrichment (see `routeFinalization` for the in-memory fallback).
 */
export async function runTurn(
  dependencies: RunTurnDependencies,
  input: PrepareTurnInput,
): Promise<RunningTurn> {
  const prepared = await prepareTurn(dependencies, input);
  const finalization = finalizePreparedTurn(dependencies, prepared, input);
  return {
    runId: prepared.execution.runId,
    stream: closeAfterFinalization(prepared.execution.stream, finalization),
  };
}

function finalizePreparedTurn(
  dependencies: RunTurnDependencies,
  prepared: PreparedTurn,
  input: PrepareTurnInput,
): Promise<void> {
  return terminalOutcome(prepared.execution).then(async (terminal) => {
    const completed = await releaseWithFinalization(dependencies, prepared, terminal);
    if (completed) {
      launchTitleGeneration(dependencies, input, terminal.assistantMessage);
    }
  });
}

/**
 * Release admission and report whether this is a fresh completion (eligible for
 * title enrichment). The in-memory fallback also claims the terminal here, since
 * its process-local store has no durable workflow to do it.
 */
async function releaseWithFinalization(
  dependencies: RunTurnDependencies,
  prepared: PreparedTurn,
  terminal: TurnExecutionTerminal,
): Promise<boolean> {
  const routeFinalization = dependencies.routeFinalization;
  const completed = terminal.status === TURN_TERMINAL_STATUSES.COMPLETED;
  if (routeFinalization === undefined) {
    await prepared.admission.release();
    return completed;
  }
  const claimed = await finalizeTurn(routeFinalization, {
    turn: prepared.turn,
    status: terminal.status,
    stepUsage: terminal.stepUsage,
    assistantMessage: terminal.assistantMessage,
    safeErrorCode: terminal.safeErrorCode,
    finishReason: terminal.finishReason,
    admission: prepared.admission,
  });
  return claimed && completed;
}

function launchTitleGeneration(
  dependencies: RunTurnDependencies,
  input: PrepareTurnInput,
  assistantMessage: UIMessage | undefined,
): void {
  const titleGeneration = dependencies.titleGeneration;
  const assistantContent = assistantText(assistantMessage);
  if (titleGeneration === undefined || assistantContent.length === 0) return;

  void startConversationTitleGeneration(titleGeneration, {
    auth: input.auth,
    conversationId: input.conversationId,
    requestId: input.requestId,
    userContent: input.acceptedUserMessage.text,
    assistantContent,
    modelId: titleGeneration.modelId,
    timeoutMs: titleGeneration.timeoutMs,
  });
}

function assistantText(message: UIMessage | undefined): string {
  return (
    message?.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim() ?? ""
  );
}

function terminalOutcome(execution: StartedTurnExecution): StartedTurnExecution["terminal"] {
  return execution.terminal.catch(() => ({
    status: TURN_TERMINAL_STATUSES.FAILED,
    stepUsage: [],
    safeErrorCode: TURN_EXECUTION_ERROR_CODES.WORKFLOW_FAILED,
  }));
}

function closeAfterFinalization(
  stream: ReadableStream<UIMessageChunk>,
  finalization: Promise<void>,
): ReadableStream<UIMessageChunk> {
  const reader = stream.getReader();
  return new ReadableStream({
    async pull(controller) {
      const next = await reader.read();
      if (!next.done) {
        controller.enqueue(next.value);
        return;
      }
      await finalization;
      controller.close();
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
