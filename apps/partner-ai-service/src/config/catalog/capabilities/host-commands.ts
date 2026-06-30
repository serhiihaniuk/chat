import type { HostCommandCapability } from "@side-chat/partner-ai-core";
import type { JsonObject } from "@side-chat/shared";

/**
 * Built-in host commands available to readable config.
 *
 * A host command is a browser action the assistant asks the host app to run
 * through the host bridge; unlike a tool in `TOOLS`, it never executes
 * server-side. This catalog exposes the stable command name, model-facing
 * description, JSON input contract, and approval posture so a config reader can
 * see what enabling it means. The host app owns the action and result.
 */
const OPEN_RESOURCE_INPUT_SCHEMA: JsonObject = {
  type: "object",
  properties: {
    resourceType: {
      type: "string",
      description: "Kind of host record to open, such as 'ticket', 'invoice', or 'customer'.",
    },
    resourceId: {
      type: "string",
      description: "Stable id of the host record to open.",
    },
  },
  required: ["resourceType", "resourceId"],
  additionalProperties: false,
};

export const HOST_COMMANDS = {
  OPEN_RESOURCE: {
    commandName: "open_resource",
    description:
      "Open a record in the host app for the user, such as a ticket, invoice, or customer. Use it when the user asks to open, show, or jump to a specific host record.",
    inputSchema: OPEN_RESOURCE_INPUT_SCHEMA,
    approvalMode: "never",
  },
} as const satisfies Record<string, HostCommandCapability>;
