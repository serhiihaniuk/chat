import { createPostgresTurnState } from "#adapters/persistence/postgres-turn-state";
import { TURN_TERMINAL_STATUSES, type TurnRef } from "#domain/turn/turn";

import type { ChatTurnFinalization } from "../chat-turn-outcome.js";

type ChatTurnFinalizeInput = Readonly<{
  databaseUrl: string;
  identity: TurnRef;
  finalization: ChatTurnFinalization;
}>;

/**
 * Persist the terminal inside the durable workflow, so a turn cannot end without a
 * durable status even if the route process dies. The claim is the idempotency
 * gate: only its winner appends the assistant message, and both it and the
 * id-keyed message upsert re-run cleanly, so replaying this step is a no-op.
 */
export async function runChatTurnFinalizeStep(input: ChatTurnFinalizeInput): Promise<void> {
  "use step";

  // A resumed step may run in another process, so it owns and closes its pool.
  const store = createPostgresTurnState(input.databaseUrl);
  try {
    const claimed = await store.claimTerminal(input.identity, input.finalization.terminal);
    if (
      claimed &&
      input.finalization.terminal.status === TURN_TERMINAL_STATUSES.COMPLETED &&
      input.finalization.assistantMessage !== undefined
    ) {
      await store.appendAssistantMessage(input.identity, input.finalization.assistantMessage);
    }
  } finally {
    await store.close();
  }
}
