import { createPostgresTurnState } from "#adapters/persistence/postgres-turn-state";
import type { TurnRef } from "#domain/turn/turn";

import type { ChatTurnFinalization } from "../outcome/chat-turn-outcome.js";

type ChatTurnFinalizeInput = Readonly<{
  databaseUrl: string;
  identity: TurnRef;
  finalization: ChatTurnFinalization;
}>;

/**
 * Persist the complete terminal projection inside the durable workflow. One
 * repository transaction commits the optional assistant message, usage, turn
 * status, conversation activity, and notification behind a guarded transition.
 * A replay after commit is a no-op; there is no terminal-without-history window.
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
