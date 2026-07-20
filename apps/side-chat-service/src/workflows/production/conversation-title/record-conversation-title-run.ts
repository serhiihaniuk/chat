import { createPostgresTurnState } from "#adapters/persistence/postgres-turn-state";
import { initializeProductionWorkflowServices } from "#composition/workflow/production";
import type { AuthContext } from "@side-chat/side-chat-server";

type TitleRunLinkage = Readonly<{
  auth: AuthContext;
  conversationId: string;
  runId: string;
}>;

/**
 * Link this title-generation run to its conversation, so the journal prune can
 * legal-hold-gate title runs the way it does turn-bound runs. Skipped without a
 * database (in-memory dev), where there is no durable journal to prune.
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
