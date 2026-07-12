import type { HostContext } from "@side-chat/chat-protocol";
import {
  createCommandResult,
  createFailedToolResult,
  createToolResult,
  createFailedResult,
  toHostCommand,
  type HostBridge,
  type HostCapabilities,
  type HostCommandResult,
  type HostToolResult,
} from "@side-chat/host-bridge";
import type { JsonObject } from "@side-chat/shared";

import type { WidgetHarnessConfig } from "#config/modes";
import type { DemoHostSurface } from "#host/demo-host-surface";

export type HarnessHostCommandRecord = {
  readonly commandId: string;
  readonly commandName: string;
  readonly result: HostCommandResult;
};

export type HarnessHostToolRecord = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly result: HostToolResult;
};

export type HarnessHostBridge = Pick<
  HostBridge,
  "getContext" | "getCapabilities" | "dispatchCommand" | "dispatchToolCall"
> & {
  readonly commandRecords: readonly HarnessHostCommandRecord[];
  readonly toolRecords: readonly HarnessHostToolRecord[];
};

const OPEN_RESOURCE_INPUT_SCHEMA: JsonObject = {
  type: "object",
  properties: {
    resourceType: {
      type: "string",
      description: "Kind of host record, e.g. 'ticket'.",
    },
    resourceId: {
      type: "string",
      description: "Stable id of the record to open.",
    },
  },
  required: ["resourceType", "resourceId"],
  additionalProperties: false,
};

/**
 * Commands the demo host declares as available each turn.
 *
 * In a real host these vary by page; the harness exposes a single `open_resource`
 * command so a model-driven call can be exercised end to end. `getCapabilities`
 * is read per turn, which is how the available set could change per page.
 */
export const HARNESS_HOST_CAPABILITIES: HostCapabilities = {
  schemaVersion: "widget-harness.capabilities.v1",
  commands: [
    {
      commandName: "open_resource",
      description:
        "Open a record in the host app for the user, such as a ticket, invoice, or customer. Use it when the user asks to open, show, or jump to a specific host record.",
      inputSchema: OPEN_RESOURCE_INPUT_SCHEMA,
    },
  ],
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
  const toolRecords: HarnessHostToolRecord[] = [];

  return {
    commandRecords,
    toolRecords,
    getContext: () => Promise.resolve(createHarnessHostContext(config)),
    getCapabilities: () => Promise.resolve(HARNESS_HOST_CAPABILITIES),
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
    dispatchToolCall: (toolCall) => {
      const result =
        config.scenario === "failed-host-command"
          ? createFailedToolResult(toolCall, "harness_tool_failed")
          : createToolResult(toolCall, {
              status: "applied",
              resultCode: "harness_local_only",
              data: { persisted: false },
            });
      toolRecords.push({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result,
      });
      surface?.applyCommand(
        { commandName: toolCall.toolName, payload: toolCall.input },
        { status: result.status, resultCode: result.resultCode },
      );
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
