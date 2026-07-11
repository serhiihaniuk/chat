import type { StartedTurnExecution } from "#application/ports/turn/turn-execution";
import {
  TURN_EXECUTION_ERROR_CODES,
  TURN_TERMINAL_STATUSES,
  type TurnOutputEvent,
} from "#domain/turn/turn";

import { finalizeTurn, type FinalizeTurnDependencies } from "../finalization/finalize-turn.js";
import {
  prepareTurn,
  type PrepareTurnDependencies,
  type PrepareTurnInput,
  type PreparedTurn,
} from "./prepare-turn.js";

export type RunTurnDependencies = PrepareTurnDependencies & FinalizeTurnDependencies;

export type RunningTurn = Readonly<{
  runId: string;
  stream: ReadableStream<TurnOutputEvent>;
}>;

/** Owns a turn from preparation through its durable terminal transition. */
export async function runTurn(
  dependencies: RunTurnDependencies,
  input: PrepareTurnInput,
): Promise<RunningTurn> {
  const prepared = await prepareTurn(dependencies, input);
  const finalization = finalizePreparedTurn(dependencies, prepared);
  return {
    runId: prepared.execution.runId,
    stream: closeAfterFinalization(prepared.execution.stream, finalization),
  };
}

function finalizePreparedTurn(
  dependencies: FinalizeTurnDependencies,
  prepared: PreparedTurn,
): Promise<boolean> {
  return terminalOutcome(prepared.execution).then((terminal) =>
    finalizeTurn(dependencies, {
      turn: prepared.turn,
      status: terminal.status,
      stepUsage: terminal.stepUsage,
      assistantMessage: terminal.assistantMessage,
      safeErrorCode: terminal.safeErrorCode,
      admission: prepared.admission,
    }),
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
  stream: ReadableStream<TurnOutputEvent>,
  finalization: Promise<boolean>,
): ReadableStream<TurnOutputEvent> {
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
