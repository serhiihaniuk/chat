import type { HostContext } from "@side-chat/chat-protocol";
import {
  createCommandResult,
  createFailedResult,
  toHostCommand,
  type HostBridge,
  type HostCommandResult,
} from "@side-chat/host-bridge";

import type { WidgetHarnessConfig } from "#config/modes";
import type { DemoHostSurface } from "#host/demo-host-surface";

export type HarnessHostCommandRecord = {
  readonly commandId: string;
  readonly commandName: string;
  readonly result: HostCommandResult;
};

export type HarnessHostBridge = Pick<HostBridge, "getContext" | "dispatchCommand"> & {
  readonly commandRecords: readonly HarnessHostCommandRecord[];
};

/**
 * Host bridge for the harness "demo host app".
 *
 * `dispatchCommand` mirrors a real host integration: it performs the requested
 * action (here, mutating the optional visible {@link DemoHostSurface}) and
 * returns a {@link HostCommandResult} the widget folds back into the timeline.
 * The `failed-host-command` scenario returns a failure so that path is testable;
 * commands are also recorded so assertions can inspect the round trip.
 */
export const createHarnessHostBridge = (
  config: WidgetHarnessConfig,
  surface?: DemoHostSurface,
): HarnessHostBridge => {
  const commandRecords: HarnessHostCommandRecord[] = [];

  return {
    commandRecords,
    getContext: () => Promise.resolve(createHarnessHostContext(config)),
    dispatchCommand: (event) => {
      const command = toHostCommand(event);
      const result =
        config.scenario === "failed-host-command"
          ? createFailedResult(command, "harness_command_failed")
          : createCommandResult(command, {
              status: "applied",
              resultCode: "harness_local_only",
              data: { persisted: false },
            });
      commandRecords.push({
        commandId: command.commandId,
        commandName: command.commandName,
        result,
      });
      surface?.applyCommand(
        { commandName: command.commandName, payload: command.payload },
        { status: result.status, resultCode: result.resultCode },
      );
      return Promise.resolve(result);
    },
  };
};

export const createHarnessHostContext = (config: WidgetHarnessConfig): HostContext => ({
  schemaVersion: "widget-harness.host-context.v1",
  origin: "http://localhost:5173",
  title: `${config.workspaceId} widget harness`,
  metadata: {
    mode: config.mode,
    workspaceId: config.workspaceId,
  },
});
