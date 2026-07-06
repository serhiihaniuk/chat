import type { Dispatch, SetStateAction } from "react";

import { toErrorMessage } from "#entities/chat";
import {
  normalizeWidgetConversationTitle,
  type RefreshConversations,
  type RefreshConversationsInput,
} from "#entities/conversation";

type SetWidgetError = Dispatch<SetStateAction<string | undefined>>;

export type RefreshConversationsAfterStreamInput = {
  readonly activeConversationId: string | undefined;
  readonly fallbackTitle: string | undefined;
  readonly refreshConversations: RefreshConversations;
  readonly setErrorMessage: SetWidgetError;
};

// The service generates the conversation title a beat AFTER the turn completes: a
// separate model call that finalizes once the browser stream has already closed, so
// the first post-turn list read almost always still carries the optimistic
// user-message title. Reconcile once, then — only while that row is still the
// fallback — keep re-reading on a spaced cadence, stopping the instant the generated
// title lands. This spans the title's typical arrival window so the sidebar updates
// on its own instead of only on a manual refresh, and the retry count is bounded so
// a title that never arrives (generation skipped or failed) cannot poll forever.
// Firing the reads back-to-back (as this once did) just re-reads the whole list
// before the title is ready, so they all miss it and waste the request.
const TITLE_REFRESH_RETRY_DELAY_MS = 1500;
export const TITLE_REFRESH_MAX_RETRIES = 5;

export const refreshConversationsAfterStream = async ({
  activeConversationId,
  fallbackTitle,
  refreshConversations,
  setErrorMessage,
}: RefreshConversationsAfterStreamInput): Promise<void> => {
  const input = { activeConversationId } satisfies RefreshConversationsInput;
  for (let retry = 0; retry <= TITLE_REFRESH_MAX_RETRIES; retry += 1) {
    const refreshed = await refreshConversationsAndReport(
      refreshConversations,
      input,
      setErrorMessage,
    );
    if (!shouldRetryFallbackTitleRefresh(refreshed, activeConversationId, fallbackTitle)) return;
    if (retry < TITLE_REFRESH_MAX_RETRIES) await delay(TITLE_REFRESH_RETRY_DELAY_MS);
  }
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const refreshConversationsAndReport = async (
  refreshConversations: RefreshConversations,
  input: RefreshConversationsInput,
  setErrorMessage: SetWidgetError,
): Promise<readonly { readonly id: string; readonly title: string }[] | undefined> => {
  try {
    return await refreshConversations(input);
  } catch (error) {
    reportRefreshError(setErrorMessage)(error);
    return undefined;
  }
};

const reportRefreshError =
  (setErrorMessage: SetWidgetError) =>
  (error: unknown): void => {
    setErrorMessage(toErrorMessage(error));
  };

const shouldRetryFallbackTitleRefresh = (
  conversations: readonly { readonly id: string; readonly title: string }[] | undefined,
  activeConversationId: string | undefined,
  fallbackTitle: string | undefined,
): boolean => {
  if (!activeConversationId || !fallbackTitle || !conversations) return false;
  const normalizedFallbackTitle = normalizeWidgetConversationTitle(fallbackTitle);
  return (
    conversations.find((conversation) => conversation.id === activeConversationId)?.title ===
    normalizedFallbackTitle
  );
};
