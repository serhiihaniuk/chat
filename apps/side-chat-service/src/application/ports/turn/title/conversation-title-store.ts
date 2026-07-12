import type { AuthContext } from "#domain/auth-context";

export type ConversationTitleEligibility = Readonly<{
  eligible: boolean;
  existingTitle?: string | undefined;
}>;

/** Persistence facts and the conditional write used by title enrichment. */
export interface ConversationTitleStore {
  readTitleEligibility(
    auth: AuthContext,
    conversationId: string,
    initialUserMessageId: string,
  ): Promise<ConversationTitleEligibility>;
  prepareConversationTitle(
    auth: AuthContext,
    conversationId: string,
    titleText: string,
  ): Promise<void>;
  /**
   * Link a title-generation Workflow run to its conversation so journal pruning
   * can honor legal_hold for title runs, which carry no assistant_turns row.
   * Idempotent on the run id.
   */
  recordConversationTitleRun(
    auth: AuthContext,
    conversationId: string,
    runId: string,
  ): Promise<void>;
}
