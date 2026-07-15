import { createPostgresTurnState } from "#adapters/persistence/postgres-turn-state";
import type { TurnRef } from "#domain/turn/turn";

import type { ChatTurnFinalization } from "../outcome/chat-turn-outcome.js";

type ChatTurnFinalizeInput = Readonly<{
  databaseUrl: string;
  identity: TurnRef;
  finalization: ChatTurnFinalization;
}>;

/**
 * Convert the workflow's terminal projection into one guarded Postgres write.
 * The source is the closed journal plus terminal outcome; the target is the
 * product turn, optional assistant message, conversation activity, and
 * notification. The transaction preserves the invariant that history and the
 * terminal state become visible together, while a replay after commit is a no-op.
 */
export async function runChatTurnFinalizeStep(input: ChatTurnFinalizeInput): Promise<void> {
  "use step";

  // A resumed step may run in another process, so it owns and closes its pool.
  const store = createPostgresTurnState(input.databaseUrl);
  try {
    await store.finalize(input.identity, input.finalization);
  } finally {
    await store.close();
  }
}
