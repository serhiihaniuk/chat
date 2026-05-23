import type { HostCommandEvent } from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";

import type { WidgetAction } from "#features/conversation/model/conversation-state";

export const dispatchHostCommandResult = (
  hostBridge: Pick<HostBridge, "dispatchCommand"> | undefined,
  dispatch: (action: WidgetAction) => void,
  event: HostCommandEvent,
): void => {
  if (!hostBridge) return;

  void hostBridge.dispatchCommand(event).then((result) => {
    dispatch({ type: "host_command_result", result });
  });
};
