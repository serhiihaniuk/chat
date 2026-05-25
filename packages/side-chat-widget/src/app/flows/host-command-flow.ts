import type { HostCommandEvent } from "@side-chat/chat-protocol";
import type { HostBridge, HostCommandResult } from "@side-chat/host-bridge";

import type { WidgetAction } from "#features/conversation/model/conversation-state";

export const dispatchHostCommandResult = (
  hostBridge: Pick<HostBridge, "dispatchCommand"> | undefined,
  dispatch: (action: WidgetAction) => void,
  event: HostCommandEvent,
): void => {
  if (!hostBridge) {
    dispatch({ type: "host_command_result", result: unsupportedResult(event) });
    return;
  }

  void hostBridge
    .dispatchCommand(event)
    .then((result) => {
      dispatch({ type: "host_command_result", result });
    })
    .catch(() => {
      dispatch({ type: "host_command_result", result: failedResult(event) });
    });
};

const unsupportedResult = (event: HostCommandEvent): HostCommandResult => ({
  commandId: event.commandId,
  commandName: event.commandName,
  resultCode: "host_bridge_not_configured",
  resolvedAt: new Date().toISOString(),
  status: "unsupported",
});

const failedResult = (event: HostCommandEvent): HostCommandResult => ({
  commandId: event.commandId,
  commandName: event.commandName,
  resultCode: "host_command_failed",
  resolvedAt: new Date().toISOString(),
  status: "failed",
});
