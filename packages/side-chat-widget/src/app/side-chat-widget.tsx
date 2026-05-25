import { useMemo, useState } from "react";

import { useWidgetChat } from "./use-widget-chat.js";
import { WidgetConversation, WidgetError } from "./widget-conversation.js";
import { WidgetFooter } from "./widget-footer.js";
import {
  ClosedWidgetLauncher,
  toPanelStyle,
  WidgetHeader,
} from "./widget-frame.js";
import type {
  SideChatWidgetLabels,
  SideChatWidgetProps,
} from "./widget.types.js";

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
  const initialProfileId =
    defaultAssistantProfileId ?? assistantProfiles.at(0)?.id;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedProfileId, setSelectedProfileId] = useState(initialProfileId);
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
    return (
      <ClosedWidgetLauncher
        label={resolvedLabels.title}
        onOpen={() => setIsOpen(true)}
      />
    );
  }

  return (
    <section
      aria-label={resolvedLabels.title}
      className="side-chat-widget-root fixed right-4 bottom-4 z-50 flex max-h-[min(760px,calc(100vh-2rem))] min-h-[520px] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-xl"
      style={toPanelStyle(defaultPanelSize)}
    >
      <WidgetHeader
        onClose={() => {
          panelActions?.onClose?.();
          setIsOpen(false);
        }}
        onProfileSelect={setSelectedProfileId}
        profiles={hasProfiles ? assistantProfiles : []}
        selectedProfileId={selectedProfileId}
        selectedProfileLabel={selectedProfile?.label}
        title={resolvedLabels.title}
      />
      <WidgetConversation messages={chat.messages} />
      <WidgetError message={chat.errorMessage} />
      <WidgetFooter
        isBusy={isBusy}
        labels={resolvedLabels}
        messageCount={chat.messages.length}
        onSubmitMessage={chat.submitMessage}
        quickActions={quickActions}
        status={chat.status}
        stop={chat.stop}
      />
    </section>
  );
};
