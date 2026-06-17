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

export const refreshConversationsAfterStream = async ({
  activeConversationId,
  fallbackTitle,
  refreshConversations,
  setErrorMessage,
}: RefreshConversationsAfterStreamInput): Promise<void> => {
  const input = { activeConversationId } satisfies RefreshConversationsInput;
  const refreshed = await refreshConversationsAndReport(
    refreshConversations,
    input,
    setErrorMessage,
  );
  if (!shouldRetryFallbackTitleRefresh(refreshed, activeConversationId, fallbackTitle)) return;

  // The service can list the newly-created conversation before the generated
  // title lands. Retry only while the active row still shows the optimistic
  // user-message title, then stop polling.
  const retried = await refreshConversationsAndReport(refreshConversations, input, setErrorMessage);
  if (!shouldRetryFallbackTitleRefresh(retried, activeConversationId, fallbackTitle)) return;

  void refreshConversations(input).catch(reportRefreshError(setErrorMessage));
};

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
