import type {
  HostCommand,
  HostCommandResult,
  HostContextSnapshot,
} from "@side-chat/shared-protocol";

/**
 * Widget ports describe what the reusable package needs from a host app.
 * They keep host state, auth, routing, and table implementations outside the UI
 * package while still giving the assistant controlled ways to interact.
 */
export type SideChatTransport = {
  streamUrl: string;
  historyUrl?: string;
  historyResetUrl?: string;
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
