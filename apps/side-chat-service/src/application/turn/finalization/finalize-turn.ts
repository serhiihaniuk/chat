import type { UIMessage } from "ai";

import type { MessageStore } from "#application/ports/turn/message-store";
import type { TurnAdmissionLease } from "#application/ports/turn/turn-admission";
import type { TurnStore } from "#application/ports/turn/turn-store";
import {
  TURN_TERMINAL_STATUSES,
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
  turns: TurnStore;
  messages: MessageStore;
}>;

/**
 * The terminal claim is the idempotency gate. Only its winner may persist an
 * assistant message, and only completed output is durable in Step 05; failed or
 * cancelled partial output remains stream-only.
 */
export async function finalizeTurn(
  dependencies: FinalizeTurnDependencies,
  input: FinalizeTurnInput,
): Promise<boolean> {
  try {
    const claimed = await dependencies.turns.claimTerminal(input.turn, {
      status: input.status,
      usage: sumTurnUsage(input.stepUsage),
      safeErrorCode: input.safeErrorCode,
      finishReason: input.finishReason,
    });
    if (!claimed) return false;

    if (input.status === TURN_TERMINAL_STATUSES.COMPLETED && input.assistantMessage !== undefined) {
      await dependencies.messages.appendAssistantMessage(input.turn, input.assistantMessage);
    }
    return true;
  } finally {
    await input.admission.release();
  }
}
