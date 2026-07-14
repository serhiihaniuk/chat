import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import {
  readWorkflowActiveTurn,
  readWorkflowChatHistory,
  readWorkflowConversations,
  WORKFLOW_CHAT_QUERY_SCOPE,
  type WorkflowChatClient,
  type WorkflowConversationClient,
} from "#entities/workflow-chat";

const WORKFLOW_QUERY = {
  ACTIVE_TURN: "active-turn",
  CONVERSATIONS: "conversations",
  HISTORY: "history",
} as const;

/** Own the catalog, history, and active-turn queries for one workflow selection. */
export function useWorkflowConversationQueries(
  queryClient: QueryClient,
  workflowChat: WorkflowChatClient,
  activeConversationId: string,
  isLocalDraft: boolean,
) {
  const conversationClient = useMemo<WorkflowConversationClient>(
    () => ({ ...workflowChat, conversationId: activeConversationId }),
    [workflowChat, activeConversationId],
  );
  const catalog = useQuery({
    queryKey: [WORKFLOW_CHAT_QUERY_SCOPE, WORKFLOW_QUERY.CONVERSATIONS, workflowChat.baseUrl],
    queryFn: ({ signal }) => readWorkflowConversations(workflowChat, signal),
  });
  const history = useQuery({
    queryKey: [
      WORKFLOW_CHAT_QUERY_SCOPE,
      WORKFLOW_QUERY.HISTORY,
      workflowChat.baseUrl,
      activeConversationId,
    ],
    enabled: !isLocalDraft,
    queryFn: ({ signal }) => readWorkflowChatHistory(conversationClient, signal),
  });
  const discovery = useQuery({
    queryKey: [
      WORKFLOW_CHAT_QUERY_SCOPE,
      WORKFLOW_QUERY.ACTIVE_TURN,
      workflowChat.baseUrl,
      activeConversationId,
    ],
    enabled: !isLocalDraft,
    // TanStack forbids an undefined result, so a run-less conversation reads null.
    queryFn: async ({ signal }) =>
      (await readWorkflowActiveTurn(conversationClient, signal)) ?? null,
  });
  const refreshConversationCatalog = useCallback((): void => {
    void queryClient.invalidateQueries({
      queryKey: [WORKFLOW_CHAT_QUERY_SCOPE, WORKFLOW_QUERY.CONVERSATIONS, workflowChat.baseUrl],
    });
  }, [queryClient, workflowChat.baseUrl]);

  return { catalog, conversationClient, discovery, history, refreshConversationCatalog };
}
