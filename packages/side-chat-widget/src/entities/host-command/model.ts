import type { HostCommandEvent } from "@side-chat/chat-protocol";
import type { HostCommandResult } from "@side-chat/host-bridge";

export type WidgetHostCommand = {
  readonly event: HostCommandEvent;
  readonly result?: HostCommandResult;
};
