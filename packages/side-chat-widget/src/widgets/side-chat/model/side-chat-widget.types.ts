import type { ChatClient } from "@side-chat/chat-client";
import type { HostBridge } from "@side-chat/host-bridge";

import type { SideChatWidgetPanelSize } from "#entities/panel";

export type SideChatWidgetLabels = {
  readonly placeholder?: string | undefined;
  readonly send?: string | undefined;
  readonly title?: string | undefined;
};

export type SideChatWidgetPanelActions = {
  readonly onClose?: (() => void) | undefined;
  readonly onMinimize?: (() => void) | undefined;
};

export type SideChatWidgetQuickAction = {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
};

export type SideChatWidgetStateSnapshot = Record<string, never>;

export type SideChatWidgetAssistantProfile = {
  readonly id: string;
  readonly label: string;
};

export type { SideChatWidgetPanelSize };

export type SideChatWidgetProps = {
  readonly assistantProfiles?: readonly SideChatWidgetAssistantProfile[] | undefined;
  readonly client: ChatClient;
  readonly conversationStorageKey?: string | undefined;
  readonly defaultAssistantProfileId?: string | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly defaultPanelSize?: SideChatWidgetPanelSize | undefined;
  readonly hostBridge?: Pick<HostBridge, "getContext" | "dispatchCommand"> | undefined;
  readonly initialState?: SideChatWidgetStateSnapshot | undefined;
  readonly labels?: SideChatWidgetLabels | undefined;
  readonly panelActions?: SideChatWidgetPanelActions | undefined;
  readonly quickActions?: readonly SideChatWidgetQuickAction[] | undefined;
};
