import type { ReactElement } from "react";

import { ConversationEmptyState } from "#shared/ai/conversation";

export const ConversationEmpty = (): ReactElement => (
  <ConversationEmptyState
    description="Ask about the current page or choose a suggested action."
    title="Ready when you are"
  />
);
