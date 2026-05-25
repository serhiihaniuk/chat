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
  readonly context?: string;
  readonly contextUsage?: string;
  readonly inputLabel?: string;
  readonly model?: string;
  readonly placeholder?: string;
  readonly pageContext?: string;
  readonly retry?: string;
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
export type SideChatWidgetHistoryStatus =
  | "empty"
  | "error"
  | "idle"
  | "loaded"
  | "loading";

export type SideChatWidgetStateSnapshot = {
  readonly activeAssistantMessageId?: string;
  readonly assistantTurnId?: string;
  readonly conversationId?: string;
  readonly errorMessage?: string;
  readonly historyStatus?: SideChatWidgetHistoryStatus;
  readonly hostCommands: readonly SideChatWidgetHostCommand[];
  readonly lastUserMessage?: string;
  readonly messages: readonly SideChatWidgetMessage[];
  readonly reasoning: readonly string[];
  readonly status: SideChatWidgetStatus;
  readonly tools: readonly ToolEvent[];
  readonly usage?: UsageMetadata;
};

export type SideChatWidgetPanelActions = {
  readonly onClose?: () => void;
  readonly onNewChat?: () => void;
  readonly onOpen?: () => void;
  readonly onOpenSettings?: () => void;
  readonly onToggleExpanded?: () => void;
};

export type SideChatWidgetQuickAction = {
  readonly disabled?: boolean;
  readonly displayContent?: string;
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
};

export type SideChatWidgetAssistantProfile = {
  readonly id: string;
  readonly label: string;
};

export type SideChatWidgetIdentity = {
  readonly conversationId?: string;
  readonly workspaceId?: string;
};

export type SideChatWidgetTransport = {
  readonly historyPath?: string;
  readonly streamPath?: string;
  readonly usagePath?: string;
};

export type SideChatWidgetPanelSize = {
  readonly height: number;
  readonly width: number;
};

export type SideChatWidgetBaseProps = {
  readonly assistantProfiles?: readonly SideChatWidgetAssistantProfile[];
  readonly defaultAssistantProfileId?: string;
  readonly defaultOpen?: boolean;
  readonly defaultPanelSize?: SideChatWidgetPanelSize;
  readonly identity?: SideChatWidgetIdentity;
  readonly initialConversationId?: string;
  readonly onError?: (message: string) => void;
  readonly onOpen?: () => void;
  readonly onUsage?: (usage: UsageMetadata) => void;
  readonly transport?: SideChatWidgetTransport;
  readonly workspaceId?: string;
} & {
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

export type SideChatWidgetEndpointProps = Omit<
  SideChatWidgetBaseProps,
  "client"
> & {
  readonly apiEndpoint: string;
  readonly client?: ChatClient;
};

export type SideChatWidgetProps =
  | SideChatWidgetBaseProps
  | SideChatWidgetEndpointProps;
