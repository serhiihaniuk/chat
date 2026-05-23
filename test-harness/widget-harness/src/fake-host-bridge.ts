import type { HostContext } from "@side-chat/chat-protocol";
import {
  createCommandResult,
  type HostBridge,
  type HostCommandResult,
} from "@side-chat/host-bridge";

import type { WidgetHarnessConfig } from "./modes.js";

export type HarnessHostCommandRecord = {
  readonly commandId: string;
  readonly commandName: string;
  readonly result: HostCommandResult;
};

export type HarnessHostBridge = Pick<
  HostBridge,
  "getContext" | "dispatchCommand"
> & {
  readonly commandRecords: readonly HarnessHostCommandRecord[];
};

export const createHarnessHostBridge = (
  config: WidgetHarnessConfig,
): HarnessHostBridge => {
  const commandRecords: HarnessHostCommandRecord[] = [];

  return {
    commandRecords,
    getContext: () => Promise.resolve(createHarnessHostContext(config)),
    dispatchCommand: (event) => {
      const result = createCommandResult(
        {
          assistantTurnId: event.assistantTurnId,
          commandId: event.commandId,
          commandName: event.commandName,
          payload: event.payload,
        },
        {
          status: "applied",
          resultCode: "harness_local_only",
          data: { persisted: false },
        },
      );
      commandRecords.push({
        commandId: event.commandId,
        commandName: event.commandName,
        result,
      });
      return Promise.resolve(result);
    },
  };
};

export const createHarnessHostContext = (
  config: WidgetHarnessConfig,
): HostContext => ({
  schemaVersion: "widget-harness.host-context.v1",
  origin: "http://localhost:5173",
  title: `${config.workspaceId} widget harness`,
  metadata: {
    mode: config.mode,
    workspaceId: config.workspaceId,
  },
});
