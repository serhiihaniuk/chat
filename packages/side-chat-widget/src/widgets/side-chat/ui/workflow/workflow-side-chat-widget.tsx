import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";

import { DEFAULT_REASONING_VISIBILITY } from "#entities/settings";
import { readWorkflowActiveTurn, readWorkflowChatHistory } from "#entities/workflow-chat";
import { WidgetHeaderTitle } from "#features/conversation";
import {
  ClosedWidgetLauncher,
  ResizablePanel,
  useWidgetPanelSize,
  WidgetHeader,
} from "#features/panel";
import { SettingsView, useSendPreference, useToolDetailPreference } from "#features/settings";
import { useWidgetAppearance, useWidgetTheme } from "#features/theme";
import { resolveWidgetLabels, WidgetLabelsProvider } from "#shared/lib/widget-labels";
import { Conversation, ConversationContent } from "#shared/ui/conversation";
import { ErrorNotice } from "#shared/ui/error-notice";
import { SideChatWidgetRoot } from "#shared/ui/widget-root";

import type { WorkflowSideChatWidgetProps } from "../../model/side-chat-widget.types.js";
import { WorkflowChatSession } from "./workflow-chat-session.js";

const WORKFLOW_HISTORY_QUERY = {
  RESOURCE: "history",
  SCOPE: "workflow-chat",
} as const;

/** Render one conversation through the native workflow transport and chat state. */
export function WorkflowSideChatWidget({
  defaultOpen = true,
  defaultPanelSize,
  defaultTheme,
  labels: labelsProp,
  hostBridge,
  onOpenChange,
  open,
  panelActions,
  panelSizeStorageKey,
  quickActions = [],
  reasoningVisibility = DEFAULT_REASONING_VISIBILITY,
  renderAgentMark,
  renderClosedLauncher = true,
  themeStorageKey,
  workflowChat,
}: WorkflowSideChatWidgetProps) {
  const labels = useMemo(() => resolveWidgetLabels(labelsProp), [labelsProp]);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;
  const { panelSize, setPanelSize } = useWidgetPanelSize({
    defaultPanelSize,
    storageKey: panelSizeStorageKey,
  });
  const theme = useWidgetTheme({ defaultTheme, storageKey: themeStorageKey });
  const appearance = useWidgetAppearance();
  const sendPreference = useSendPreference();
  const toolDetailPreference = useToolDetailPreference();
  const history = useQuery({
    queryKey: [
      WORKFLOW_HISTORY_QUERY.SCOPE,
      WORKFLOW_HISTORY_QUERY.RESOURCE,
      workflowChat.baseUrl,
      workflowChat.conversationId,
    ],
    queryFn: ({ signal }) => readWorkflowChatHistory(workflowChat, signal),
  });
  const discovery = useQuery({
    queryKey: [
      WORKFLOW_HISTORY_QUERY.SCOPE,
      "active-turn",
      workflowChat.baseUrl,
      workflowChat.conversationId,
    ],
    // TanStack forbids an undefined result, so a run-less conversation reads null.
    queryFn: async ({ signal }) => (await readWorkflowActiveTurn(workflowChat, signal)) ?? null,
  });

  const requestOpenChange = (nextOpen: boolean): void => {
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  if (!isOpen && renderClosedLauncher) {
    return (
      <SideChatWidgetRoot
        data-sidechat-accent={appearance.appearanceRootProps["data-sidechat-accent"]}
        style={appearance.appearanceRootProps.style}
        theme={theme.themeId}
      >
        <ClosedWidgetLauncher label={labels.title} onOpen={() => requestOpenChange(true)} />
      </SideChatWidgetRoot>
    );
  }
  if (!isOpen) return null;

  let historyContent: ReactNode;
  if (history.isPending) {
    historyContent = <Conversation aria-label={labels.headerConversationFeed}>{null}</Conversation>;
  } else if (history.error) {
    historyContent = (
      <Conversation aria-label={labels.headerConversationFeed}>
        <ConversationContent className="mx-auto w-full max-w-measure-message px-4 pt-4">
          <ErrorNotice message={history.error.message} onRetry={() => void history.refetch()} />
        </ConversationContent>
      </Conversation>
    );
  } else {
    historyContent = (
      <WorkflowChatSession
        initialMessages={history.data ?? []}
        labels={labels}
        sendOnEnter={!sendPreference.sendWithCtrlEnter}
        hostBridge={hostBridge}
        activeTurn={discovery.data ?? undefined}
        quickActions={quickActions}
        reasoningVisibility={reasoningVisibility}
        renderAgentMark={renderAgentMark}
        toolDetail={toolDetailPreference.toolDetail}
        workflowChat={workflowChat}
      />
    );
  }

  return (
    <WidgetLabelsProvider value={labels}>
      <ResizablePanel
        anchor="fixed"
        aria-label={labels.title}
        data-sidechat-accent={appearance.appearanceRootProps["data-sidechat-accent"]}
        defaultSize={panelSize}
        onSizeChange={setPanelSize}
        role="region"
        style={appearance.appearanceRootProps.style}
        theme={theme.themeId}
      >
        <WorkflowWidgetPanelBody
          appearance={appearance}
          historyContent={historyContent}
          labels={labels}
          onClose={() => {
            panelActions?.onClose?.();
            requestOpenChange(false);
          }}
          renderAgentMark={renderAgentMark}
          sendPreference={sendPreference}
          theme={theme}
          toolDetailPreference={toolDetailPreference}
        />
      </ResizablePanel>
    </WidgetLabelsProvider>
  );
}

/**
 * The panel's inner chrome: the settings view, or the header plus the conversation
 * content. Owning `isSettingsOpen` here (rather than in the parent) keeps settings
 * and its trigger together and matches the legacy shell's structure.
 */
function WorkflowWidgetPanelBody({
  appearance,
  historyContent,
  labels,
  onClose,
  renderAgentMark,
  sendPreference,
  theme,
  toolDetailPreference,
}: {
  readonly appearance: ReturnType<typeof useWidgetAppearance>;
  readonly historyContent: ReactNode;
  readonly labels: ReturnType<typeof resolveWidgetLabels>;
  readonly onClose: () => void;
  readonly renderAgentMark: WorkflowSideChatWidgetProps["renderAgentMark"];
  readonly sendPreference: ReturnType<typeof useSendPreference>;
  readonly theme: ReturnType<typeof useWidgetTheme>;
  readonly toolDetailPreference: ReturnType<typeof useToolDetailPreference>;
}): ReactNode {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  if (isSettingsOpen) {
    return (
      <SettingsView
        accent={appearance.accent}
        corners={appearance.corners}
        density={appearance.density}
        elevation={appearance.elevation}
        onAccentChange={appearance.setAccent}
        onBack={() => setIsSettingsOpen(false)}
        onCornersChange={appearance.setCorners}
        onDensityChange={appearance.setDensity}
        onElevationChange={appearance.setElevation}
        onSelectTheme={theme.setTheme}
        onSendWithCtrlEnterChange={sendPreference.setSendWithCtrlEnter}
        onTextSizeChange={appearance.setTextSize}
        onToolDetailChange={toolDetailPreference.setToolDetail}
        onTypefaceChange={appearance.setTypeface}
        sendWithCtrlEnter={sendPreference.sendWithCtrlEnter}
        textSize={appearance.textSize}
        themeId={theme.themeId}
        toolDetail={toolDetailPreference.toolDetail}
        typeface={appearance.typeface}
      />
    );
  }
  return (
    <>
      <WidgetHeader
        onClose={onClose}
        onOpenSettings={() => setIsSettingsOpen(true)}
        title={<WidgetHeaderTitle renderAgentMark={renderAgentMark} title={labels.title} />}
      />
      {historyContent}
    </>
  );
}
