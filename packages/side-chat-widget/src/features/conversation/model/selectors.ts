import type { WidgetState } from "./conversation-state.js";

export const shouldShowConversationEmptyState = (state: WidgetState): boolean =>
  state.messages.length === 0 &&
  state.historyStatus !== "loading" &&
  !state.errorMessage;

export const hasConversationError = (state: WidgetState): boolean =>
  typeof state.errorMessage === "string" && state.errorMessage.length > 0;
