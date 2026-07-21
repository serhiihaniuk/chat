import {
  createPostgresTurnState,
  type PostgresTurnState,
} from "#adapters/persistence/postgres-turn-state";

export type ClosableWorkflowStepStore = Readonly<{
  close: () => Promise<void>;
}>;

export type WorkflowStepStoreFactory<Store extends ClosableWorkflowStepStore> = (
  databaseUrl: string,
) => Store;

/** Create the Node-only product store used by one durable Workflow step. */
export function createWorkflowStepStore(databaseUrl: string): PostgresTurnState {
  return createPostgresTurnState(databaseUrl);
}

/**
 * A resumed step can run in another process, so each step owns a fresh pool.
 * This boundary guarantees that pool closes after both successful and failed work.
 */
export async function withWorkflowStepStore<Store extends ClosableWorkflowStepStore, Result>(
  databaseUrl: string,
  createStore: WorkflowStepStoreFactory<Store>,
  runWithStore: (store: Store) => Promise<Result>,
): Promise<Result> {
  const store = createStore(databaseUrl);
  try {
    return await runWithStore(store);
  } finally {
    await store.close();
  }
}
