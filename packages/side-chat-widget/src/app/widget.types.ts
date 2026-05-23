import type { ChatClient } from "@side-chat/chat-client";
import type {
  ChatStreamRequest,
  HostCommandEvent,
  HostContext,
  ToolEvent,
} from "@side-chat/chat-protocol";
import type { HostBridge, HostCommandResult } from "@side-chat/host-bridge";

export type SideChatWidgetLabels = {
  readonly context?: string;
  readonly contextUsage?: string;
  readonly inputLabel?: string;
  readonly model?: string;
  readonly placeholder?: string;
  readonly send?: string;
  readonly title?: string;
};

export type SideChatWidgetMessage = {
  readonly content: string;
  readonly id: string;
  readonly role: "assistant" | "system" | "user";
  readonly sequence: number;
};

export type SideChatWidgetHostCommand = {
  readonly event: HostCommandEvent;
  readonly result?: HostCommandResult;
};

export type SideChatWidgetStatus = "completed" | "error" | "idle" | "streaming";

export type SideChatWidgetStateSnapshot = {
  readonly assistantTurnId?: string;
  readonly conversationId?: string;
  readonly errorMessage?: string;
  readonly hostCommands: readonly SideChatWidgetHostCommand[];
  readonly messages: readonly SideChatWidgetMessage[];
  readonly reasoning: readonly string[];
  readonly status: SideChatWidgetStatus;
  readonly tools: readonly ToolEvent[];
};

export type SideChatWidgetPanelActions = {
  readonly onClose?: () => void;
  readonly onNewChat?: () => void;
  readonly onOpenSettings?: () => void;
  readonly onToggleExpanded?: () => void;
};

export type SideChatWidgetQuickAction = {
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
};

export type SideChatWidgetProps = {
  readonly client: ChatClient;
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
