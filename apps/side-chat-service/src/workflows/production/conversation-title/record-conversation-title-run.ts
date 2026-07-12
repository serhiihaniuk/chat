import { createPostgresTurnState } from "#adapters/persistence/postgres-turn-state";
import { initializeProductionWorkflowServices } from "#composition/workflow/production";
import type { AuthContext } from "#domain/auth-context";

type TitleRunLinkage = Readonly<{
  auth: AuthContext;
  conversationId: string;
  runId: string;
}>;

/**
 * Link this title-generation run to its conversation inside the workflow's Node
 * activity boundary, so the journal prune can legal-hold-gate title runs exactly
 * as it does turn-bound runs. A deployment without a database (in-memory dev) has
 * no durable journal to prune, so the linkage is skipped there.
 */
export async function recordConversationTitleRun(input: TitleRunLinkage): Promise<void> {
  "use step";

  const databaseUrl = initializeProductionWorkflowServices().databaseUrl;
  if (databaseUrl === undefined) return;

  // A resumed step may run in another process, so it owns and closes its pool.
  const store = createPostgresTurnState(databaseUrl);
  try {
    await store.recordConversationTitleRun(input.auth, input.conversationId, input.runId);
  } finally {
    await store.close();
  }
}
