import type { AuthContext } from "@side-chat/side-chat-server";

export type ConversationTitleEligibility = Readonly<{
  eligible: boolean;
  existingTitle?: string | undefined;
}>;

/** Persistence facts and the conditional write used by title enrichment. */
export interface ConversationTitleStore {
  readTitleEligibility(
    auth: AuthContext,
    conversationId: string,
  ): Promise<ConversationTitleEligibility>;
  prepareConversationTitle(
    auth: AuthContext,
    conversationId: string,
    titleText: string,
  ): Promise<void>;
  /**
   * Link a title-generation run to its conversation so journal pruning can honor
   * legal_hold for title runs the way it does turn runs. Idempotent on the run id.
   */
  recordConversationTitleRun(
    auth: AuthContext,
    conversationId: string,
    runId: string,
  ): Promise<void>;
}
