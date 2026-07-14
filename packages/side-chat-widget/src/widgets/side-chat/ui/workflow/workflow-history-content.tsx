import type { ReactNode } from "react";

import type { WidgetLabels } from "#shared/lib/widget-labels";
import { Conversation, ConversationContent } from "#shared/ui/conversation";
import { ErrorNotice } from "#shared/ui/error-notice";

/** Keep draft, loading, history failure, and recovered-session rendering explicit. */
export function selectWorkflowHistoryContent({
  error,
  isLocalDraft,
  isPending,
  isRecoveryPending,
  labels,
  onRetry,
  preserveSession,
  session,
}: Readonly<{
  error: Error | null;
  isLocalDraft: boolean;
  isPending: boolean;
  isRecoveryPending: boolean;
  labels: WidgetLabels;
  onRetry: () => void;
  /** The mounted chat owns a run accepted in this tab; query refreshes must not replace it. */
  preserveSession: boolean;
  session: ReactNode;
}>): ReactNode {
  if (preserveSession) return session;
  if (!isLocalDraft && (isPending || isRecoveryPending)) {
    return <Conversation aria-label={labels.headerConversationFeed}>{null}</Conversation>;
  }
  if (!isLocalDraft && error) {
    return (
      <Conversation aria-label={labels.headerConversationFeed}>
        <ConversationContent className="mx-auto w-full max-w-measure-message px-4 pt-4">
          <ErrorNotice message={error.message} onRetry={onRetry} />
        </ConversationContent>
      </Conversation>
    );
  }
  return session;
}
