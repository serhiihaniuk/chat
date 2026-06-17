import { isRecord } from "@side-chat/shared";

import type { ConversationSummary } from "../api/client/side-chat-api-types.js";

export type WidgetConversationSummary = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly lastMessageAt: string;
};

export type WidgetConversationStoreSnapshot = {
  readonly activeConversationId?: string | undefined;
  readonly conversations: readonly WidgetConversationSummary[];
};

type StoredWidgetConversationStore = {
  readonly activeConversationId: string | null;
  readonly conversations: readonly WidgetConversationSummary[];
};

const EMPTY_STORE: WidgetConversationStoreSnapshot = { conversations: [] };
const DEFAULT_CONVERSATION_TITLE = "Untitled chat";
const MAX_CONVERSATION_TITLE_LENGTH = 80;

export const toWidgetConversationSummary = (
  conversation: ConversationSummary,
): WidgetConversationSummary => ({
  id: conversation.conversationId,
  title: normalizeWidgetConversationTitle(conversation.title),
  status: conversation.status,
  lastMessageAt: conversation.lastMessageAt,
});

export const upsertStartedConversationSummary = (
  conversations: readonly WidgetConversationSummary[],
  input: {
    readonly conversationId: string;
    readonly fallbackTitle: string;
    readonly lastMessageAt: string;
  },
): readonly WidgetConversationSummary[] => {
  const existing = conversations.find((conversation) => conversation.id === input.conversationId);
  if (existing) {
    return [
      { ...existing, lastMessageAt: input.lastMessageAt },
      ...conversations.filter((conversation) => conversation.id !== existing.id),
    ];
  }

  const summary: WidgetConversationSummary = {
    id: input.conversationId,
    title: normalizeWidgetConversationTitle(input.fallbackTitle),
    status: "active",
    lastMessageAt: input.lastMessageAt,
  };
  return [summary, ...conversations.filter((conversation) => conversation.id !== summary.id)];
};

export const reconcileConversationSummaries = (
  server: readonly WidgetConversationSummary[],
  current: readonly WidgetConversationSummary[],
  activeConversationId: string | undefined,
): readonly WidgetConversationSummary[] => {
  if (
    !activeConversationId ||
    server.some((conversation) => conversation.id === activeConversationId)
  ) {
    return server;
  }

  const active = current.find((conversation) => conversation.id === activeConversationId);
  return active ? [active, ...server] : server;
};

export const readWidgetConversationStore = (
  storageKey: string | undefined,
): WidgetConversationStoreSnapshot => {
  const storage = readLocalStorage(storageKey);
  if (!storage) return EMPTY_STORE;

  try {
    const parsed = JSON.parse(storage) as unknown;
    if (!isRecord(parsed)) return EMPTY_STORE;
    return {
      activeConversationId: readStoredActiveConversationId(parsed["activeConversationId"]),
      conversations: readStoredConversations(parsed["conversations"]),
    };
  } catch {
    return EMPTY_STORE;
  }
};

export const writeWidgetConversationStore = (
  storageKey: string | undefined,
  snapshot: WidgetConversationStoreSnapshot,
): void => {
  if (!storageKey || typeof window === "undefined") return;
  try {
    const payload: StoredWidgetConversationStore = {
      activeConversationId: snapshot.activeConversationId ?? null,
      conversations: snapshot.conversations,
    };
    window.localStorage?.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Some embedded hosts deny localStorage. Chat still works; the selected
    // conversation simply cannot be restored by the browser shell.
  }
};

const readLocalStorage = (storageKey: string | undefined): string | undefined => {
  if (!storageKey || typeof window === "undefined") return undefined;
  try {
    return window.localStorage?.getItem(storageKey) ?? undefined;
  } catch {
    return undefined;
  }
};

const readStoredConversations = (value: unknown): readonly WidgetConversationSummary[] =>
  Array.isArray(value) ? value.flatMap(readStoredConversation) : [];

const readStoredActiveConversationId = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const readStoredConversation = (value: unknown): readonly WidgetConversationSummary[] => {
  if (
    !isRecord(value) ||
    typeof value["id"] !== "string" ||
    typeof value["title"] !== "string" ||
    typeof value["status"] !== "string" ||
    typeof value["lastMessageAt"] !== "string"
  ) {
    return [];
  }

  return [
    {
      id: value["id"],
      title: normalizeWidgetConversationTitle(value["title"]),
      status: value["status"],
      lastMessageAt: value["lastMessageAt"],
    },
  ];
};

export const normalizeWidgetConversationTitle = (title: string): string => {
  const normalized = title.trim().replaceAll(/\s+/gu, " ");
  if (!normalized) return DEFAULT_CONVERSATION_TITLE;
  return normalized.length > MAX_CONVERSATION_TITLE_LENGTH
    ? `${normalized.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 1)}...`
    : normalized;
};
