import { useCallback, useEffect, useState } from "react";

export type WorkflowConversationSelection = Readonly<{
  activeConversationId: string;
  commitLocalDraft: () => void;
  isLocalDraft: boolean;
  selectConversation: (conversationId: string) => void;
  startNewConversation: () => void;
}>;

/** Own a local draft until its first settled turn makes the id server-readable. */
export function useMissingConversationFallback({
  activeConversationId,
  conversations,
  error,
  isLocalDraft,
  selectConversation,
}: Readonly<{
  activeConversationId: string;
  conversations: readonly Readonly<{ id: string }>[] | undefined;
  error: unknown;
  isLocalDraft: boolean;
  selectConversation: (conversationId: string) => void;
}>): void {
  useEffect(() => {
    if (isLocalDraft || !isNotFoundError(error) || conversations === undefined) return;
    if (conversations.some((conversation) => conversation.id === activeConversationId)) return;
    const fallback = conversations[0];
    if (fallback !== undefined) selectConversation(fallback.id);
  }, [activeConversationId, conversations, error, isLocalDraft, selectConversation]);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, "status") === 404;
}

export function useWorkflowConversationSelection(
  initialConversationId: string,
  onConversationIdChange: ((conversationId: string) => void) | undefined,
): WorkflowConversationSelection {
  const [activeConversationId, setActiveConversationId] = useState(initialConversationId);
  const [localDraftConversationId, setLocalDraftConversationId] = useState<string>();
  const startNewConversation = useCallback((): void => {
    const conversationId = crypto.randomUUID();
    setLocalDraftConversationId(conversationId);
    setActiveConversationId(conversationId);
  }, []);
  const selectConversation = useCallback(
    (conversationId: string): void => {
      setLocalDraftConversationId(undefined);
      setActiveConversationId(conversationId);
      onConversationIdChange?.(conversationId);
    },
    [onConversationIdChange],
  );
  const commitLocalDraft = useCallback((): void => {
    if (localDraftConversationId !== activeConversationId) return;
    setLocalDraftConversationId(undefined);
    onConversationIdChange?.(activeConversationId);
  }, [activeConversationId, localDraftConversationId, onConversationIdChange]);
  return {
    activeConversationId,
    commitLocalDraft,
    isLocalDraft: localDraftConversationId === activeConversationId,
    selectConversation,
    startNewConversation,
  };
}
