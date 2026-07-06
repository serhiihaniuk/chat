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
 * Force a fresh read of one conversation's transcript.
 *
 * Resolves with the freshly fetched history, or `undefined` when nothing fresh
 * landed (no id, the query is not being observed, or the refetch failed) — so a
 * caller doing a run→history handoff can keep the live run visible instead of
 * clearing it onto stale or missing data.
 */
export type RefreshHistory = (
  conversationId: string | undefined,
) => Promise<ReadHistoryResult | undefined>;

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
    // The activity stream force-refreshes the list on each (re)connect and on tab
    // focus, so the query itself need not refetch on every re-render; hold it fresh
    // for 30 s (the QueryClient already disables refetch-on-window-focus).
    staleTime: 30_000,
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
    // `refreshHistory` (the run→history handoff, the header Refresh button, and a
    // cross-tab resume) force-fetches and writes this cache; hold it fresh for 30 s so
    // the query does not re-fetch the transcript the handoff just wrote when it
    // re-enables after the run clears.
    staleTime: 30_000,
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
  // Force a fresh read of one conversation's transcript: after a turn finishes
  // (run→history handoff), or after a reload when a turn finished while away.
  // `fetchQuery` (not `invalidateQueries`) fetches imperatively and returns the data
  // without needing an active observer, and deduplicates against the history query's
  // own in-flight fetch — so the terminal auto-fetch and this handoff read collapse to
  // one request instead of one canceling the other. `staleTime: 0` still forces the
  // handoff's settle-poll to re-read the server on each retry.
  const refreshHistory = useCallback<RefreshHistory>(
    async (conversationId) => {
      if (!conversationId || !client.readHistory) return undefined;
      try {
        return await queryClient.fetchQuery({
          queryKey: conversationQueryKeys.history(conversationId),
          queryFn: ({ signal }) => readConversationHistory(client, conversationId, signal),
          staleTime: 0,
        });
      } catch {
        return undefined;
      }
    },
    [client, queryClient],
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
