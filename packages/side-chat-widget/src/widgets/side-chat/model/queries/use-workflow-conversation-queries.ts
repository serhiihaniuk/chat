import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import {
  type WorkflowConversationCatalog,
  type WorkflowConversationState,
  readWorkflowConversationState,
  readWorkflowConversations,
  workflowChatQueryScopeKey,
  type WorkflowChatClient,
  type WorkflowConversationClient,
  type TurnActivityEvent,
} from "#entities/workflow-chat";

import {
  findConversationTitle,
  refreshWorkflowConversationTitle,
} from "../refresh/workflow-conversation-title-refresh.js";

const WORKFLOW_QUERY = {
  CONVERSATIONS: "conversations",
  STATE: "state",
} as const;

type ObservedConversationState = Readonly<{
  observationId: string;
  snapshot: WorkflowConversationState;
}>;

/** Own the catalog and coherent selected-conversation state query. */
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
    queryKey: [...workflowChatQueryScopeKey(workflowChat), WORKFLOW_QUERY.CONVERSATIONS],
    queryFn: ({ signal }) => readWorkflowConversations(workflowChat, signal),
  });
  const state = useQuery<ObservedConversationState>({
    queryKey: [
      ...workflowChatQueryScopeKey(workflowChat),
      WORKFLOW_QUERY.STATE,
      activeConversationId,
    ],
    enabled: !isLocalDraft,
    queryFn: async ({ signal }) => ({
      observationId: crypto.randomUUID(),
      snapshot: await readWorkflowConversationState(conversationClient, signal),
    }),
  });
  const refreshConversationCatalog = useCallback((): void => {
    void queryClient.invalidateQueries({
      queryKey: [...workflowChatQueryScopeKey(workflowChat), WORKFLOW_QUERY.CONVERSATIONS],
    });
  }, [queryClient, workflowChat]);

  const refreshConversationTitle = useCallback(
    (conversationId: string): Promise<boolean> =>
      refreshConversationTitleCatalog(queryClient, workflowChat, conversationId),
    [queryClient, workflowChat],
  );

  const applyActivityEvent = useCallback(
    (event: TurnActivityEvent): void => {
      queryClient.setQueryData<WorkflowConversationCatalog>(
        [...workflowChatQueryScopeKey(workflowChat), WORKFLOW_QUERY.CONVERSATIONS],
        (current) => updateRunningConversationIds(current, event),
      );
    },
    [queryClient, workflowChat],
  );
  const refreshConversation = useCallback(
    (conversationId: string): void => {
      void queryClient.invalidateQueries({
        queryKey: [
          ...workflowChatQueryScopeKey(workflowChat),
          WORKFLOW_QUERY.STATE,
          conversationId,
        ],
      });
    },
    [queryClient, workflowChat],
  );

  return {
    applyActivityEvent,
    catalog,
    conversationClient,
    state,
    refreshConversation,
    refreshConversationCatalog,
    refreshConversationTitle,
  };
}

const conversationCatalogQueryKey = (client: WorkflowChatClient) =>
  [...workflowChatQueryScopeKey(client), WORKFLOW_QUERY.CONVERSATIONS] as const;

function refreshConversationTitleCatalog(
  queryClient: QueryClient,
  workflowChat: WorkflowChatClient,
  conversationId: string,
): Promise<boolean> {
  const queryKey = conversationCatalogQueryKey(workflowChat);
  const current = queryClient.getQueryData<WorkflowConversationCatalog>(queryKey);
  return refreshWorkflowConversationTitle({
    conversationId,
    initialTitle: findConversationTitle(current, conversationId),
    readCatalog: () => readFreshConversationCatalog(queryClient, workflowChat),
  });
}

function readFreshConversationCatalog(
  queryClient: QueryClient,
  workflowChat: WorkflowChatClient,
): Promise<WorkflowConversationCatalog> {
  return queryClient.fetchQuery({
    queryKey: conversationCatalogQueryKey(workflowChat),
    queryFn: ({ signal }) => readWorkflowConversations(workflowChat, signal),
    staleTime: 0,
  });
}

function updateRunningConversationIds(
  catalog: WorkflowConversationCatalog | undefined,
  event: TurnActivityEvent,
): WorkflowConversationCatalog | undefined {
  if (!catalog) return catalog;
  const runningConversationIds = new Set(catalog.runningConversationIds);
  if (event.status === "running") runningConversationIds.add(event.conversationId);
  else runningConversationIds.delete(event.conversationId);
  return { ...catalog, runningConversationIds };
}
