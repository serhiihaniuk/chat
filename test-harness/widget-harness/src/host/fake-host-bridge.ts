import {
  createFailedToolResult,
  createToolResult,
  type HostBridge,
  type HostCapabilities,
  type HostContext,
  type HostToolResult,
} from "@side-chat/host-bridge";
import type { JsonObject } from "@side-chat/shared";

import type { WidgetHarnessConfig } from "#config/modes";
import type { DemoHostSurface } from "#host/demo-host-surface";

export type HarnessHostToolRecord = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly result: HostToolResult;
};

export type HarnessHostBridge = Pick<
  HostBridge,
  "getContext" | "getCapabilities" | "dispatchToolCall"
> & {
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
 * Client tools the demo host declares as available each turn.
 *
 * In a real host these vary by page; the harness exposes a single `open_resource`
 * tool so a model-driven call can be exercised end to end. `getCapabilities`
 * is read per turn, which is how the available set could change per page.
 */
export const HARNESS_HOST_CAPABILITIES: HostCapabilities = {
  schemaVersion: "widget-harness.capabilities.v1",
  tools: [
    {
      toolName: "open_resource",
      description:
        "Open a record in the host app for the user, such as a ticket, invoice, or customer. Use it when the user asks to open, show, or jump to a specific host record.",
      inputSchema: OPEN_RESOURCE_INPUT_SCHEMA,
    },
  ],
};

/**
 * Host bridge for the harness "demo host app".
 *
 * `dispatchToolCall` mirrors a real host integration: it performs the requested
 * action (here, mutating the optional visible {@link DemoHostSurface}) and
 * returns a result the widget folds back into the timeline. The
 * `failed-host-tool` scenario returns a failure so that path is testable; calls
 * are also recorded so assertions can inspect the round trip.
 */
export const createHarnessHostBridge = (
  config: WidgetHarnessConfig,
  surface?: DemoHostSurface,
): HarnessHostBridge => {
  const toolRecords: HarnessHostToolRecord[] = [];

  return {
    toolRecords,
    getContext: () => Promise.resolve(createHarnessHostContext(config)),
    getCapabilities: () =>
      Promise.resolve(
        config.clientToolsEnabled
          ? HARNESS_HOST_CAPABILITIES
          : { ...HARNESS_HOST_CAPABILITIES, tools: [] },
      ),
    dispatchToolCall: (toolCall) => {
      const result =
        config.scenario === "failed-host-tool"
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
      surface?.applyToolCall(
        { toolName: toolCall.toolName, input: toolCall.input },
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
