import { createPostgresTurnState } from "#adapters/persistence/postgres-turn-state";
import type { ClientToolWorkflowStore } from "#application/ports/turn/tools/client-tool-dispatch-store";

export type ClosableClientToolWorkflowStore = ClientToolWorkflowStore & {
  readonly close: () => Promise<void>;
};

/** Node-only store factory consumed exclusively inside a Workflow step activity. */
export function createClientToolWorkflowStore(
  databaseUrl: string,
): ClosableClientToolWorkflowStore {
  return createPostgresTurnState(databaseUrl);
}
