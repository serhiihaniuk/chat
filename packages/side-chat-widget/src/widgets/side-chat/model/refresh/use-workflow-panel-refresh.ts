import type { QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { workflowChatQueryScopeKey, type WorkflowChatClient } from "#entities/workflow-chat";

/** Refetch workflow reads without replacing the live native chat session. */
export function useWorkflowPanelRefresh(
  queryClient: QueryClient,
  workflowChat: WorkflowChatClient,
): Readonly<{ refresh: () => void }> {
  const refresh = useCallback((): void => {
    void queryClient.invalidateQueries({
      queryKey: workflowChatQueryScopeKey(workflowChat),
      refetchType: "active",
    });
  }, [queryClient, workflowChat]);

  return { refresh };
}
