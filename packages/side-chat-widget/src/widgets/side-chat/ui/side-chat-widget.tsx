import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

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
  return (
    <QueryClientProvider client={queryClient}>
      <WorkflowSideChatWidget {...props} />
    </QueryClientProvider>
  );
}
