import type { TurnAdmission, TurnAdmissionLease } from "#application/ports/turn/turn-admission";
import type { StartedTurnExecution, TurnExecution } from "#application/ports/turn/turn-execution";
import type { TurnStore } from "#application/ports/turn/turn-store";
import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import type { AuthContext } from "#domain/auth-context";
import {
  TURN_EXECUTION_ERROR_CODES,
  TURN_TERMINAL_STATUSES,
  ZERO_TURN_USAGE,
  type TurnMessage,
  type TurnRef,
} from "#domain/turn/turn";

export type PrepareTurnInput = Readonly<{
  auth: AuthContext;
  conversationId: string;
  requestId: string;
  modelId: string;
  messages: readonly TurnMessage[];
  acceptedUserMessage: TurnMessage;
  clientTools?: readonly ClientToolDefinition[];
}>;

export type PreparedTurn = Readonly<{
  turn: TurnRef;
  execution: StartedTurnExecution;
  admission: TurnAdmissionLease;
}>;

export type PrepareTurnDependencies = Readonly<{
  admission: TurnAdmission;
  turns: TurnStore;
  execution: TurnExecution;
}>;

/**
 * Owns the pre-execution transaction order. Policy rejection happens before
 * writes; once accepted, the user message remains audit history even if the
 * workflow cannot start. The caller retains the admission lease until terminal
 * finalization, while a failed start releases it here.
 */
export async function prepareTurn(
  dependencies: PrepareTurnDependencies,
  input: PrepareTurnInput,
): Promise<PreparedTurn> {
  await dependencies.turns.assertCanBegin(input.auth, input.conversationId);
  const admission = await dependencies.admission.admitTurn(input.conversationId);

  try {
    const turn = await dependencies.turns.beginTurn({
      auth: input.auth,
      conversationId: input.conversationId,
      requestId: input.requestId,
      userMessage: input.acceptedUserMessage,
    });
    const executionInput = {
      conversationId: turn.conversationId,
      turnId: turn.turnId,
      requestId: input.requestId,
      modelId: input.modelId,
      messages: input.messages,
      clientTools: input.clientTools ?? [],
    };
    const execution = await startExecution(dependencies, turn, executionInput);
    await dependencies.turns.bindRun(turn, execution.runId);
    return { turn, execution, admission };
  } catch (error) {
    await admission.release();
    throw error;
  }
}

async function startExecution(
  dependencies: PrepareTurnDependencies,
  turn: TurnRef,
  input: Parameters<TurnExecution["start"]>[0],
): Promise<StartedTurnExecution> {
  try {
    return await dependencies.execution.start(input);
  } catch (error) {
    await dependencies.turns.claimTerminal(turn, {
      status: TURN_TERMINAL_STATUSES.FAILED,
      usage: ZERO_TURN_USAGE,
      safeErrorCode: TURN_EXECUTION_ERROR_CODES.WORKFLOW_FAILED,
    });
    throw error;
  }
}
