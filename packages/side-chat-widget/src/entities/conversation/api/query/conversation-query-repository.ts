import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  reconcileConversationSummaries,
  toWidgetConversationSummary,
  upsertStartedConversationSummary,
  type WidgetConversationSummary,
} from "../../model/widget-conversation.js";
import { SideChatApiError } from "../http/side-chat-api-error.js";
import type { ReadHistoryResult, SideChatApiClient } from "../client/side-chat-api-types.js";

const CONVERSATION_LIST_LIMIT = 25;
const CONVERSATION_HISTORY_LIMIT = 100;
const CONVERSATION_QUERY_ROOT = ["sidechat-widget", "conversation"] as const;
const MODEL_CATALOG_QUERY_ROOT = ["sidechat-widget", "models"] as const;
const TOOL_CATALOG_QUERY_ROOT = ["sidechat-widget", "tools"] as const;

const conversationQueryKeys = {
  lists: () => [...CONVERSATION_QUERY_ROOT, "list"] as const,
  list: () => [...conversationQueryKeys.lists(), { limit: CONVERSATION_LIST_LIMIT }] as const,
  histories: () => [...CONVERSATION_QUERY_ROOT, "history"] as const,
  history: (conversationId: string | undefined) =>
    [
      ...conversationQueryKeys.histories(),
      conversationId ?? "none",
      { limit: CONVERSATION_HISTORY_LIMIT },
    ] as const,
};

type UseGetConversationsInput = {
  readonly activeConversationId: string | undefined;
  readonly client: SideChatApiClient;
  readonly initialConversations: readonly WidgetConversationSummary[];
};

type UseGetConversationHistoryInput = {
  readonly client: SideChatApiClient;
  readonly conversationId: string | undefined;
  readonly enabled: boolean;
};

type UseGetModelCatalogInput = {
  readonly client: SideChatApiClient;
};

type UseGetToolCatalogInput = {
  readonly client: SideChatApiClient;
};

type ResetConversationInput = {
  readonly conversationId: string;
};

type UpsertStartedConversationInput = {
  readonly conversationId: string;
  readonly fallbackTitle: string;
  readonly lastMessageAt: string;
};

export type RefreshConversationsInput = {
  readonly activeConversationId?: string | undefined;
};

export type RefreshConversations = (
  input?: RefreshConversationsInput,
) => Promise<readonly WidgetConversationSummary[]>;

/**
 * Owns React Query access for widget conversation resources.
 *
 * Fetch/SSE details stay in the widget API client, while components and chat
 * feature hooks consume named resource hooks. Query keys, invalidation, and
 * optimistic cache writes remain here so UI code never assembles cache identity.
 */
export const useGetConversations = ({
  activeConversationId,
  client,
  initialConversations,
}: UseGetConversationsInput) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: conversationQueryKeys.list(),
    queryFn: async ({ signal }) => {
      const serverConversations = await readConversationSummaries(client, signal);
      const currentConversations =
        queryClient.getQueryData<readonly WidgetConversationSummary[]>(
          conversationQueryKeys.list(),
        ) ?? initialConversations;

      return reconcileConversationSummaries(
        serverConversations,
        currentConversations,
        activeConversationId,
      );
    },
    enabled: client.listConversations !== undefined,
    initialData: initialConversations,
    initialDataUpdatedAt: 0,
  });
};

export const useGetConversationHistory = ({
  client,
  conversationId,
  enabled,
}: UseGetConversationHistoryInput) =>
  useQuery({
    queryKey: conversationQueryKeys.history(conversationId),
    queryFn: ({ signal }) => readConversationHistory(client, conversationId, signal),
    enabled: enabled && conversationId !== undefined && client.readHistory !== undefined,
  });

export const useGetModelCatalog = ({ client }: UseGetModelCatalogInput) =>
  useQuery({
    queryKey: MODEL_CATALOG_QUERY_ROOT,
    queryFn: ({ signal }) => readModelCatalog(client, signal),
    enabled: client.listModels !== undefined,
    staleTime: 60_000,
  });

export const useGetToolCatalog = ({ client }: UseGetToolCatalogInput) =>
  useQuery({
    queryKey: TOOL_CATALOG_QUERY_ROOT,
    queryFn: ({ signal }) => readToolCatalog(client, signal),
    enabled: client.listTools !== undefined,
    staleTime: 60_000,
  });

export const useResetConversation = (client: SideChatApiClient) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId }: ResetConversationInput) =>
      resetConversation(client, conversationId),
    onSuccess: async (_reset, { conversationId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: conversationQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: conversationQueryKeys.history(conversationId) }),
      ]);
    },
  });
};

const readModelCatalog = async (
  client: SideChatApiClient,
  signal: AbortSignal,
): Promise<Awaited<ReturnType<NonNullable<SideChatApiClient["listModels"]>>>> => {
  if (!client.listModels) {
    throw new SideChatApiError("network_error", "Model catalog is not available");
  }

  return client.listModels({ signal });
};

const readToolCatalog = async (
  client: SideChatApiClient,
  signal: AbortSignal,
): Promise<Awaited<ReturnType<NonNullable<SideChatApiClient["listTools"]>>>> => {
  if (!client.listTools) {
    throw new SideChatApiError("network_error", "Tool catalog is not available");
  }

  return client.listTools({ signal });
};

export const useConversationQueryRepository = ({
  activeConversationId,
  client,
  initialConversations,
}: UseGetConversationsInput) => {
  const queryClient = useQueryClient();
  const refreshConversations = useCallback<RefreshConversations>(
    async (input = {}) => {
      const currentConversations =
        queryClient.getQueryData<readonly WidgetConversationSummary[]>(
          conversationQueryKeys.list(),
        ) ?? initialConversations;
      if (!client.listConversations) return currentConversations;

      const serverConversations = await readConversationSummaries(client);
      const nextConversations = reconcileConversationSummaries(
        serverConversations,
        currentConversations,
        input.activeConversationId ?? activeConversationId,
      );

      queryClient.setQueryData(conversationQueryKeys.list(), nextConversations);
      return nextConversations;
    },
    [activeConversationId, client, initialConversations, queryClient],
  );
  const upsertStartedConversation = useCallback(
    (input: UpsertStartedConversationInput) => {
      queryClient.setQueryData<readonly WidgetConversationSummary[]>(
        conversationQueryKeys.list(),
        (current = []) => upsertStartedConversationSummary(current, input),
      );
    },
    [queryClient],
  );
  // Force a fresh read of one conversation's transcript. Used after a reload when a
  // turn finished while away: the cached history may have been fetched mid-flight
  // (before the assistant message committed), so the final answer needs a refetch.
  const refreshHistory = useCallback(
    (conversationId: string | undefined): void => {
      if (!conversationId) return;
      void queryClient.invalidateQueries({
        queryKey: conversationQueryKeys.history(conversationId),
      });
    },
    [queryClient],
  );

  return {
    refreshConversations,
    upsertStartedConversation,
    refreshHistory,
  };
};

const readConversationSummaries = async (
  client: SideChatApiClient,
  signal?: AbortSignal,
): Promise<readonly WidgetConversationSummary[]> => {
  const result = await client.listConversations?.({ limit: CONVERSATION_LIST_LIMIT, signal });
  return result?.conversations.map(toWidgetConversationSummary) ?? [];
};

const readConversationHistory = async (
  client: SideChatApiClient,
  conversationId: string | undefined,
  signal: AbortSignal,
): Promise<ReadHistoryResult> => {
  if (!conversationId || !client.readHistory) {
    throw new SideChatApiError("network_error", "Conversation history is not available");
  }

  return client.readHistory(conversationId, {
    limit: CONVERSATION_HISTORY_LIMIT,
    signal,
  });
};

const resetConversation = async (
  client: SideChatApiClient,
  conversationId: string,
): Promise<void> => {
  if (!client.resetHistory) {
    throw new SideChatApiError("network_error", "Conversation reset is not available");
  }

  await client.resetHistory(conversationId);
};
