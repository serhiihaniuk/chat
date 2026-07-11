import type { UIMessage, UIMessageChunk } from "ai";

import {
  startConversationTitleGeneration,
  type ConversationTitleDependencies,
} from "#application/conversations/generate-conversation-title";
import type { StartedTurnExecution } from "#application/ports/turn/turn-execution";
import { TURN_EXECUTION_ERROR_CODES, TURN_TERMINAL_STATUSES } from "#domain/turn/turn";

import { finalizeTurn, type FinalizeTurnDependencies } from "../finalization/finalize-turn.js";
import {
  prepareTurn,
  type PrepareTurnDependencies,
  type PrepareTurnInput,
  type PreparedTurn,
} from "./prepare-turn.js";

export type RunTurnDependencies = PrepareTurnDependencies &
  FinalizeTurnDependencies &
  Readonly<{
    titleGeneration?:
      | (ConversationTitleDependencies & Readonly<{ modelId: string; timeoutMs: number }>)
      | undefined;
  }>;

export type RunningTurn = Readonly<{
  runId: string;
  stream: ReadableStream<UIMessageChunk>;
}>;

/** Owns a turn from preparation through its durable terminal transition. */
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
): Promise<boolean> {
  return terminalOutcome(prepared.execution).then(async (terminal) => {
    const claimed = await finalizeTurn(dependencies, {
      turn: prepared.turn,
      status: terminal.status,
      stepUsage: terminal.stepUsage,
      assistantMessage: terminal.assistantMessage,
      safeErrorCode: terminal.safeErrorCode,
      finishReason: terminal.finishReason,
      admission: prepared.admission,
    });
    if (claimed) launchTitleGeneration(dependencies, input, terminal.assistantMessage);
    return claimed;
  });
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
    initialUserMessageId: input.acceptedUserMessage.id,
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
  finalization: Promise<boolean>,
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
