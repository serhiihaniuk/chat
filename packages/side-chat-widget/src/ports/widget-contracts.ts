import type {
  HostCommand,
  HostCommandResult,
  HostContextSnapshot,
} from "@side-chat/shared-protocol";

export type SideChatTransport = {
  streamUrl: string;
  historyUrl?: string;
  usageUrl?: string;
  protocol?: "sidechat.v1";
};

export type SideChatIdentity = {
  workspaceId: string;
  userId?: string;
  conversationId?: string;
};

export type SideChatHostBridge = {
  getContext?: () =>
    | HostContextSnapshot
    | undefined
    | Promise<HostContextSnapshot | undefined>;
  dispatchCommand?: (
    command: HostCommand,
  ) => HostCommandResult | Promise<HostCommandResult>;
};
