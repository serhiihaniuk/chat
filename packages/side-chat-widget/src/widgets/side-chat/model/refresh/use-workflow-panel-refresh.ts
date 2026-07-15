import type { QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { WORKFLOW_CHAT_QUERY_SCOPE } from "#entities/workflow-chat";

/** Refetch workflow reads without replacing the live native chat session. */
export function useWorkflowPanelRefresh(
  queryClient: QueryClient,
): Readonly<{ refresh: () => void }> {
  const refresh = useCallback((): void => {
    void queryClient.invalidateQueries({
      queryKey: [WORKFLOW_CHAT_QUERY_SCOPE],
      refetchType: "active",
    });
  }, [queryClient]);

  return { refresh };
}
