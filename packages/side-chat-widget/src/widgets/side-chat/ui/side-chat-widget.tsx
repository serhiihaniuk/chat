import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { workflowChatQueryScopeKey, workflowChatScopeIdentity } from "#entities/workflow-chat";

import { createSideChatWidgetQueryClient } from "../model/side-chat-query-client.js";
import type { SideChatWidgetProps } from "../model/side-chat-widget.types.js";
import { WorkflowSideChatWidget } from "./workflow/workflow-side-chat-widget.js";

export type {
  RenderActivityItem,
  SideChatActivityItem,
  SideChatWidgetLabels,
  SideChatWidgetPanelActions,
  SideChatWidgetPanelSize,
  SideChatWidgetProps,
  SideChatWidgetQuickAction,
  WorkflowSideChatWidgetProps,
} from "../model/side-chat-widget.types.js";

/** Render the single native Workflow-backed Side Chat implementation. */
export function SideChatWidget(props: SideChatWidgetProps) {
  const [queryClient] = useState(createSideChatWidgetQueryClient);
  const scopeIdentity = workflowChatScopeIdentity(props.workflowChat);
  const previousScope = useRef({
    identity: scopeIdentity,
    queryKey: workflowChatQueryScopeKey(props.workflowChat),
  });

  useEffect(() => {
    if (previousScope.current.identity === scopeIdentity) return;
    queryClient.removeQueries({ queryKey: previousScope.current.queryKey });
    previousScope.current = {
      identity: scopeIdentity,
      queryKey: workflowChatQueryScopeKey(props.workflowChat),
    };
  }, [props.workflowChat, queryClient, scopeIdentity]);

  return (
    <QueryClientProvider client={queryClient}>
      <WorkflowSideChatWidget key={scopeIdentity} {...props} />
    </QueryClientProvider>
  );
}
