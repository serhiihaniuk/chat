import type { ChatClient } from "@side-chat/chat-client";
import type { ChatStreamRequest, HostContext } from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";

export type SideChatWidgetLabels = {
  readonly placeholder?: string;
  readonly send?: string;
  readonly title?: string;
};

export type SideChatWidgetPanelActions = {
  readonly onClose?: () => void;
  readonly onMinimize?: () => void;
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

export type SideChatWidgetPanelSize = {
  readonly height: number;
  readonly width: number;
};

export type SideChatWidgetProps = {
  readonly assistantProfiles?: readonly SideChatWidgetAssistantProfile[];
  readonly client: ChatClient;
  readonly defaultAssistantProfileId?: string;
  readonly defaultOpen?: boolean;
  readonly defaultPanelSize?: SideChatWidgetPanelSize;
  readonly hostBridge?: Pick<HostBridge, "getContext" | "dispatchCommand">;
  readonly initialState?: SideChatWidgetStateSnapshot;
  readonly labels?: SideChatWidgetLabels;
  readonly panelActions?: SideChatWidgetPanelActions;
  readonly quickActions?: readonly SideChatWidgetQuickAction[];
  readonly requestFactory?: (
    message: string,
    hostContext?: HostContext,
  ) => ChatStreamRequest;
};

export const SideChatWidget = (props: SideChatWidgetProps) => {
  void props;
  return null;
};
