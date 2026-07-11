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
}
