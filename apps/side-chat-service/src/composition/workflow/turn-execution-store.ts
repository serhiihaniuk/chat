import { createPostgresTurnState } from "#adapters/persistence/postgres-turn-state";
import type { TurnExecutionClaimStore } from "#application/ports/turn/turn-store";

export type ClosableTurnExecutionClaimStore = TurnExecutionClaimStore & {
  readonly close: () => Promise<void>;
};

/** Node-only store factory consumed exclusively inside a Workflow step activity. */
export function createTurnExecutionClaimStore(
  databaseUrl: string,
): ClosableTurnExecutionClaimStore {
  return createPostgresTurnState(databaseUrl);
}
