import { useMemo, useState } from "react";

import { useWidgetChat } from "./use-widget-chat.js";
import { WidgetConversation, WidgetError } from "./widget-conversation.js";
import { WidgetFooter } from "./widget-footer.js";
import { ClosedWidgetLauncher, ResizeHandles, toPanelStyle, WidgetHeader } from "./widget-frame.js";
import { useResizableWidgetPanel } from "./widget-resize.js";
import type { SideChatWidgetLabels, SideChatWidgetProps } from "./widget.types.js";

export type {
  SideChatWidgetAssistantProfile,
  SideChatWidgetLabels,
  SideChatWidgetPanelActions,
  SideChatWidgetPanelSize,
  SideChatWidgetProps,
  SideChatWidgetQuickAction,
  SideChatWidgetStateSnapshot,
} from "./widget.types.js";

const defaultLabels = {
  placeholder: "Ask anything...",
  send: "Send",
  title: "Workspace Assistant",
} satisfies Required<SideChatWidgetLabels>;

export const SideChatWidget = ({
  assistantProfiles = [],
  client,
  defaultAssistantProfileId,
  defaultOpen = true,
  defaultPanelSize,
  hostBridge,
  labels,
  panelActions,
  quickActions = [],
  requestFactory,
}: SideChatWidgetProps) => {
  const resolvedLabels = { ...defaultLabels, ...labels };
  const initialProfileId = defaultAssistantProfileId ?? assistantProfiles.at(0)?.id;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedProfileId, setSelectedProfileId] = useState(initialProfileId);
  const panel = useResizableWidgetPanel(defaultPanelSize);
  const selectedProfile = useMemo(
    () => assistantProfiles.find((profile) => profile.id === selectedProfileId),
    [assistantProfiles, selectedProfileId],
  );
  const hasProfiles = assistantProfiles.length > 0;
  const chat = useWidgetChat({
    client,
    hostBridge,
    requestFactory,
    selectedProfileId,
  });
  const isBusy = chat.status === "submitted" || chat.status === "streaming";

  if (!isOpen) {
    return <ClosedWidgetLauncher label={resolvedLabels.title} onOpen={() => setIsOpen(true)} />;
  }

  return (
    <section
      aria-label={resolvedLabels.title}
      className="side-chat-widget-root fixed right-4 bottom-4 z-50 flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-xl"
      style={toPanelStyle(panel.panelSize, panel.panelOffset)}
    >
      <ResizeHandles onResizeStart={panel.startResize} />
      <WidgetHeader
        onClose={() => {
          panelActions?.onClose?.();
          setIsOpen(false);
        }}
        title={resolvedLabels.title}
      />
      <WidgetConversation messages={chat.messages} />
      <WidgetError message={chat.errorMessage} />
      <WidgetFooter
        isBusy={isBusy}
        labels={resolvedLabels}
        messageCount={chat.messages.length}
        messages={chat.messages}
        onSubmitMessage={chat.submitMessage}
        onProfileSelect={setSelectedProfileId}
        profiles={hasProfiles ? assistantProfiles : []}
        quickActions={quickActions}
        selectedProfileId={selectedProfileId}
        selectedProfileLabel={selectedProfile?.label}
        status={chat.status}
        stop={chat.stop}
        usage={chat.usage}
      />
    </section>
  );
};
