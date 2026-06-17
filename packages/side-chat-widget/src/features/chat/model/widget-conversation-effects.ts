import type { ChatClient } from "@side-chat/chat-client";
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { toErrorMessage, type WidgetMessage } from "#entities/chat";
import {
  toWidgetConversationSummary,
  toWidgetHistoryMessages,
  writeWidgetConversationStore,
  type WidgetConversationSummary,
} from "./widget-conversations.js";

type SetWidgetMessages = Dispatch<SetStateAction<WidgetMessage[]>>;
type SetWidgetError = Dispatch<SetStateAction<string | undefined>>;
type SetWidgetConversations = Dispatch<SetStateAction<readonly WidgetConversationSummary[]>>;

export const useConversationList = (
  client: ChatClient,
  setConversations: SetWidgetConversations,
  setErrorMessage: SetWidgetError,
  activeConversationId: string | undefined,
) => {
  // Read the active id at load time (not as a useCallback dep) so loadConversations
  // stays stable and the list refetch isn't re-triggered on every conversation switch.
  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;
  const loadConversations = useCallback(
    (signal?: AbortSignal) =>
      loadConversationSummaries(client, setConversations, activeConversationIdRef, signal),
    [client, setConversations],
  );

  useEffect(
    () => runAbortableLoad((signal) => loadConversations(signal), reportError(setErrorMessage)),
    [loadConversations, setErrorMessage],
  );

  return loadConversations;
};

export const usePersistConversationStore = (
  conversationStorageKey: string | undefined,
  conversationId: string | undefined,
  conversations: readonly WidgetConversationSummary[],
): void => {
  useEffect(() => {
    writeWidgetConversationStore(conversationStorageKey, {
      activeConversationId: conversationId,
      conversations,
    });
  }, [conversationId, conversationStorageKey, conversations]);
};

// History loads only when the user switches TO a conversation. The id a stream
// establishes (recorded in streamOwnedConversationRef) already has live messages
// in state, so refetching it would clobber the just-streamed turn — including the
// activity timeline, which history does not carry. The ref is cleared on explicit
// selection so switching back to that conversation does hydrate from history.
export const useConversationHistory = (
  client: ChatClient,
  conversationId: string | undefined,
  streamOwnedConversationRef: { readonly current: string | undefined },
  setMessages: SetWidgetMessages,
  setErrorMessage: SetWidgetError,
  setIsLoadingHistory: Dispatch<SetStateAction<boolean>>,
): void => {
  useEffect(() => {
    if (
      !conversationId ||
      !client.readHistory ||
      conversationId === streamOwnedConversationRef.current
    ) {
      setIsLoadingHistory(false);
      return undefined;
    }

    setIsLoadingHistory(true);
    return runAbortableLoad(
      (signal) =>
        loadConversationHistory(client, conversationId, setMessages, setIsLoadingHistory, signal),
      reportError(setErrorMessage),
    );
  }, [
    client,
    conversationId,
    setErrorMessage,
    setIsLoadingHistory,
    setMessages,
    streamOwnedConversationRef,
  ]);
};

// One place that owns the AbortController + non-abort error routing the read
// effects used to hand-roll three times over. Returns the effect cleanup.
const runAbortableLoad = (
  load: (signal: AbortSignal) => Promise<void>,
  onError: (error: unknown) => void,
): (() => void) => {
  const controller = new AbortController();
  void load(controller.signal).catch((error: unknown) => {
    if (!controller.signal.aborted) onError(error);
  });
  return () => controller.abort();
};

const loadConversationSummaries = async (
  client: ChatClient,
  setConversations: SetWidgetConversations,
  activeConversationIdRef: MutableRefObject<string | undefined>,
  signal?: AbortSignal,
): Promise<void> => {
  if (!client.listConversations) return;
  const result = await client.listConversations({ limit: 25, signal });
  const summaries = result.conversations.map(toWidgetConversationSummary);
  setConversations((current) =>
    reconcileConversations(summaries, current, activeConversationIdRef.current),
  );
};

// The server list is authoritative, but keep the active conversation visible if the
// server has not caught up yet (a just-created chat) so it does not flicker out and
// back when the post-completion refresh returns a stale list.
const reconcileConversations = (
  server: readonly WidgetConversationSummary[],
  current: readonly WidgetConversationSummary[],
  activeConversationId: string | undefined,
): readonly WidgetConversationSummary[] => {
  if (!activeConversationId || server.some((c) => c.id === activeConversationId)) return server;
  const active = current.find((c) => c.id === activeConversationId);
  return active ? [active, ...server] : server;
};

const loadConversationHistory = async (
  client: ChatClient,
  conversationId: string,
  setMessages: SetWidgetMessages,
  setIsLoadingHistory: Dispatch<SetStateAction<boolean>>,
  signal: AbortSignal,
): Promise<void> => {
  try {
    const history = await client.readHistory?.(conversationId, { limit: 100, signal });
    if (!signal.aborted && history) setMessages([...toWidgetHistoryMessages(history)]);
  } finally {
    if (!signal.aborted) setIsLoadingHistory(false);
  }
};

const reportError =
  (setErrorMessage: SetWidgetError) =>
  (error: unknown): void => {
    setErrorMessage(toErrorMessage(error));
  };
