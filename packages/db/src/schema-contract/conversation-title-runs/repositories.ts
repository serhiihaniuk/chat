import type { ConversationId } from "../ids/persistence-ids.js";
import type { RepositoryCommandEnvelope } from "../repositories.js";

/**
 * Link a title-generation Workflow run to its conversation.
 *
 * Title runs are their own Workflow runs with no assistant_turns row, so the
 * journal prune reads this mapping to legal-hold-gate them like turn-bound runs.
 * Idempotent on `runId` so a durable replay of the recording step is a no-op.
 */
export type RecordConversationTitleRunCommand = RepositoryCommandEnvelope & {
  readonly conversationId: ConversationId;
  readonly runId: string;
};

export type ConversationTitleRunRepositoryContract = {
  readonly recordConversationTitleRun: (
    command: RecordConversationTitleRunCommand,
  ) => Promise<void>;
};
