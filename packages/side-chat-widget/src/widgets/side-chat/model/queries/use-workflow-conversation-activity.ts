import { useCallback, useMemo } from "react";
import { isRunningActivity, type TurnActivityEvent } from "@side-chat/chat-protocol";

import type { WorkflowChatClient } from "#entities/workflow-chat";
import type { WorkflowWidgetChatSessionRegistry } from "#features/workflow-chat";
import { subscribeWorkflowActivity } from "./workflow-conversation-activity-client.js";
import { useActivityStream } from "#features/chat";

type WorkflowConversationActivityOptions = Readonly<{
  activeConversationId: string;
  applyActivityEvent: (event: TurnActivityEvent) => void;
  isLocalDraft: boolean;
  refreshConversation: (conversationId: string) => void;
  refreshConversationCatalog: () => void;
  sessionRegistry: WorkflowWidgetChatSessionRegistry;
  workflowChat: WorkflowChatClient;
}>;

/** Keep catalog and selected-history queries aligned with subject-scoped turn activity. */
export function useWorkflowConversationActivity({
  activeConversationId,
  applyActivityEvent,
  isLocalDraft,
  refreshConversation,
  refreshConversationCatalog,
  sessionRegistry,
  workflowChat,
}: WorkflowConversationActivityOptions): void {
  const activityClient = useMemo(
    () => ({
      subscribeActivity: (options: { readonly signal?: AbortSignal | undefined } = {}) =>
        subscribeWorkflowActivity(workflowChat, options.signal),
    }),
    [workflowChat],
  );
  const handleActivity = useCallback(
    (event: TurnActivityEvent): void => {
      applyActivityEvent(event);
      refreshConversationCatalog();
      if (!isLocalDraft && event.conversationId === activeConversationId) {
        refreshConversation(activeConversationId);
      }
      if (!isRunningActivity(event) && event.conversationId !== activeConversationId) {
        void sessionRegistry.reconcileInactiveConversation(event.conversationId);
      }
    },
    [
      activeConversationId,
      applyActivityEvent,
      isLocalDraft,
      refreshConversation,
      refreshConversationCatalog,
      sessionRegistry,
    ],
  );
  useActivityStream({
    client: activityClient,
    onSynchronized: () => {
      refreshConversationCatalog();
      if (!isLocalDraft) refreshConversation(activeConversationId);
    },
    onVisibilityReconcile: () => {
      refreshConversationCatalog();
      if (!isLocalDraft) refreshConversation(activeConversationId);
    },
    onEvent: handleActivity,
  });
}
