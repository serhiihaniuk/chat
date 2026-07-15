import type { UIMessage } from "ai";

import type { TurnAdmissionLease } from "#application/ports/turn/turn-admission";
import type { TurnStore } from "#application/ports/turn/turn-store";
import {
  sumTurnUsage,
  type TurnRef,
  type TurnExecutionErrorCode,
  type TurnTerminalStatus,
  type TurnUsage,
} from "#domain/turn/turn";

export type FinalizeTurnInput = Readonly<{
  turn: TurnRef;
  status: TurnTerminalStatus;
  stepUsage: readonly TurnUsage[];
  assistantMessage?: UIMessage | undefined;
  safeErrorCode?: TurnExecutionErrorCode | undefined;
  finishReason?: string | undefined;
  admission: TurnAdmissionLease;
}>;

export type FinalizeTurnDependencies = Readonly<{
  turns: Pick<TurnStore, "finalize">;
}>;

/**
 * Finalize one turn through the aggregate store boundary. The in-memory adapter
 * runs here; durable Postgres runs the same contract inside the Workflow step.
 * The guarded running-to-terminal transition is the idempotency boundary, and
 * its winner writes any admitted assistant message with the terminal projection.
 * Failed and cancelled turns may carry safe partial output; blocked output does
 * not reach this input. Returns whether this call won that transition.
 */
export async function finalizeTurn(
  dependencies: FinalizeTurnDependencies,
  input: FinalizeTurnInput,
): Promise<boolean> {
  try {
    return await dependencies.turns.finalize(input.turn, {
      terminal: {
        status: input.status,
        usage: sumTurnUsage(input.stepUsage),
        safeErrorCode: input.safeErrorCode,
        finishReason: input.finishReason,
      },
      assistantMessage: input.assistantMessage,
    });
  } finally {
    await input.admission.release();
  }
}
