import type { ChatClient } from "@side-chat/chat-client";
import type { HostBridge } from "@side-chat/host-bridge";

import type { ReasoningVisibility } from "#entities/settings";
import type { SideChatWidgetPanelSize } from "#entities/panel";
import type { WidgetThemeId } from "#entities/theme";

export type { ReasoningVisibility, WidgetThemeId };

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
  readonly defaultTheme?: WidgetThemeId | undefined;
  readonly hostBridge?: Pick<HostBridge, "getContext" | "dispatchCommand"> | undefined;
  readonly initialState?: SideChatWidgetStateSnapshot | undefined;
  readonly labels?: SideChatWidgetLabels | undefined;
  readonly panelActions?: SideChatWidgetPanelActions | undefined;
  readonly quickActions?: readonly SideChatWidgetQuickAction[] | undefined;
  // Host/server-configured: how much assistant reasoning the widget exposes by
  // default. Defaults to "minimal" (collapsed). Not a user-facing setting.
  readonly reasoningVisibility?: ReasoningVisibility | undefined;
  readonly themeStorageKey?: string | undefined;
};
