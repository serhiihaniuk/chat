import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { WORKFLOW_CHAT_QUERY_SCOPE } from "#entities/workflow-chat";

/** Refetch every active workflow read, then remount a persisted chat for replay. */
export function useWorkflowPanelRefresh(
  queryClient: QueryClient,
  activeConversationId: string,
  isLocalDraft: boolean,
): Readonly<{ refresh: () => void; sessionRevision: number }> {
  const selectionRef = useRef({ activeConversationId, isLocalDraft });
  selectionRef.current = { activeConversationId, isLocalDraft };
  const [sessionRevision, setSessionRevision] = useState(0);

  const refresh = useCallback((): void => {
    const target = selectionRef.current;
    void queryClient
      .invalidateQueries({ queryKey: [WORKFLOW_CHAT_QUERY_SCOPE], refetchType: "active" })
      .finally(() => {
        if (target.isLocalDraft) return;
        if (selectionRef.current.activeConversationId !== target.activeConversationId) return;
        setSessionRevision((revision) => revision + 1);
      });
  }, [queryClient]);

  return { refresh, sessionRevision };
}
