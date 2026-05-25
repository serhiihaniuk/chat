import type { ChatClient } from "@side-chat/chat-client";
import type {
  ChatStreamRequest,
  HostCommandEvent,
  HostContext,
  ToolEvent,
  UsageMetadata,
} from "@side-chat/chat-protocol";
import type { HostBridge, HostCommandResult } from "@side-chat/host-bridge";

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
  readonly requestFactory?: (message: string, hostContext?: HostContext) => ChatStreamRequest;
};

export type WidgetStatus = "idle" | "submitted" | "streaming" | "error";
export type WidgetUsage = UsageMetadata;

export type WidgetMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly reasoning: readonly string[];
  readonly tools: readonly ToolEvent[];
  readonly hostCommands: readonly HostCommandView[];
  readonly isStreaming?: boolean;
};

export type HostCommandView = {
  readonly event: HostCommandEvent;
  readonly result?: HostCommandResult;
  readonly status: "running" | "completed" | "failed";
};
