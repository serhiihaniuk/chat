import type { ChatClient } from "@side-chat/chat-client";

import type { WidgetAction } from "#features/conversation/model/conversation-state";

export type RefreshUsageOptions = {
  readonly client: ChatClient;
  readonly dispatch: (action: WidgetAction) => void;
};

export const refreshUsage = async ({
  client,
  dispatch,
}: RefreshUsageOptions): Promise<void> => {
  if (!client.readUsage) return;
  try {
    dispatch({ type: "usage_loaded", usage: await client.readUsage() });
  } catch {
    // Usage is informational; stream completion already carries fallback usage.
  }
};
