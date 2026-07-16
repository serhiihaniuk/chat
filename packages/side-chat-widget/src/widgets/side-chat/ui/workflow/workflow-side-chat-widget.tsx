import { useEffect, useMemo, useState } from "react";

import { ClosedWidgetLauncher, ResizablePanel, useWidgetPanelSize } from "#features/panel";
import {
  createWorkflowWidgetChatSessionRegistry,
  useWorkflowModelSelection,
} from "#features/workflow-chat";
import { useWidgetAppearance, useWidgetTheme } from "#features/theme";
import { resolveWidgetLabels, WidgetLabelsProvider } from "#shared/lib/widget-labels";
import { SideChatWidgetRoot } from "#shared/ui/widget-root";

import type { WorkflowSideChatWidgetProps } from "../../model/side-chat-widget.types.js";
import { useWorkflowHostContextSelection } from "../../model/selection/side-chat-host-context-selection.js";
import { useWorkflowToolSelection } from "../../model/selection/side-chat-tool-selection.js";
import { WorkflowConversationPanel } from "./panel/workflow-conversation-panel.js";
/** Render a workspace's conversations through the native workflow transport. */
export function WorkflowSideChatWidget({
  defaultOpen = true,
  defaultPanelSize,
  defaultTheme,
  labels: labelsProp,
  hostBridge,
  initialConversationId,
  onOpenChange,
  open,
  panelActions,
  panelSizeStorageKey,
  quickActions = [],
  renderActivityItem,
  renderAgentMark,
  renderClosedLauncher = true,
  themeStorageKey,
  workflowChat,
  workflowActiveTurnStorageKey,
  workflowConversationSelectionStorageKey,
}: WorkflowSideChatWidgetProps) {
  const labels = useMemo(() => resolveWidgetLabels(labelsProp), [labelsProp]);
  const [sessionRegistry] = useState(createWorkflowWidgetChatSessionRegistry);
  useEffect(() => {
    const disposeOnPageExit = (event: PageTransitionEvent): void => {
      if (!event.persisted) sessionRegistry.disposeAll();
    };
    window.addEventListener("pagehide", disposeOnPageExit);
    return () => {
      window.removeEventListener("pagehide", disposeOnPageExit);
      sessionRegistry.disposeAll();
    };
  }, [sessionRegistry]);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;
  const { panelSize, setPanelSize } = useWidgetPanelSize({
    defaultPanelSize,
    storageKey: panelSizeStorageKey,
  });
  const theme = useWidgetTheme({ defaultTheme, storageKey: themeStorageKey });
  const appearance = useWidgetAppearance();
  const modelSelection = useWorkflowModelSelection(workflowChat);
  const hostContextSelection = useWorkflowHostContextSelection(workflowChat, hostBridge);
  const toolSelection = useWorkflowToolSelection(workflowChat);
  const requestOpenChange = (nextOpen: boolean): void => {
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  if (!isOpen && renderClosedLauncher) {
    return (
      <SideChatWidgetRoot {...appearance.appearanceRootProps} theme={theme.themeId}>
        <ClosedWidgetLauncher label={labels.title} onOpen={() => requestOpenChange(true)} />
      </SideChatWidgetRoot>
    );
  }
  if (!isOpen) return null;
  return (
    <WidgetLabelsProvider value={labels}>
      <ResizablePanel
        {...appearance.appearanceRootProps}
        anchor="fixed"
        aria-label={labels.title}
        defaultSize={panelSize}
        onSizeChange={setPanelSize}
        role="region"
        theme={theme.themeId}
      >
        <WorkflowConversationPanel
          appearance={appearance}
          hostBridge={hostBridge}
          hostContextSelection={hostContextSelection}
          labels={labels}
          initialConversationId={initialConversationId}
          onClose={() => {
            panelActions?.onClose?.();
            requestOpenChange(false);
          }}
          quickActions={quickActions}
          renderActivityItem={renderActivityItem}
          renderAgentMark={renderAgentMark}
          theme={theme}
          workflowChat={workflowChat}
          workflowActiveTurnStorageKey={workflowActiveTurnStorageKey}
          workflowConversationSelectionStorageKey={workflowConversationSelectionStorageKey}
          modelSelection={modelSelection}
          sessionRegistry={sessionRegistry}
          toolSelection={toolSelection}
        />
      </ResizablePanel>
    </WidgetLabelsProvider>
  );
}
