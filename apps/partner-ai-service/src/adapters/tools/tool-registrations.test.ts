import { createRuntimeToolFromPromise } from "@side-chat/agent-runtime";
import { describe, expect, it } from "vitest";

import { createServiceToolRegistration } from "#composition/tools/service-tool-registry";
import { MOCK_WEB_SEARCH_TOOL_NAME } from "./mock-web-search-tool.js";
import {
  DEFAULT_TOOL_REGISTRATIONS,
  availableToolNames,
  findToolRegistrationFactory,
  type ConfiguredToolInput,
  type ToolRegistrationFactory,
} from "./tool-registrations.js";

const INPUT: ConfiguredToolInput = {
  description: "A configured tool.",
  label: "Configured tool",
  defaultEnabled: true,
  approvalPolicyIds: [],
};

describe("tool registrations", () => {
  it("exposes the shipped tool names for config validation", () => {
    expect(availableToolNames()).toContain(MOCK_WEB_SEARCH_TOOL_NAME);
  });

  it("dispatches a known configured name to its registration factory", () => {
    const registration = findToolRegistrationFactory(MOCK_WEB_SEARCH_TOOL_NAME)?.(INPUT);
    expect(registration?.name).toBe(MOCK_WEB_SEARCH_TOOL_NAME);
  });

  it("returns no factory for an unknown configured name", () => {
    expect(findToolRegistrationFactory("does.not.exist")).toBeUndefined();
  });

  it("dispatches a tool added to the registry by name, with no edits to the dispatcher", () => {
    // A new map entry: the exact edit an adopter makes to add a config-driven tool.
    const customFactory: ToolRegistrationFactory = (input) =>
      createServiceToolRegistration({
        capability: {
          name: "example.custom",
          description: input.description,
          inputSchema: { type: "object", properties: {}, additionalProperties: true },
        },
        runtimeTool: createRuntimeToolFromPromise({
          name: "example.custom",
          description: input.description,
          inputSchema: { type: "object", properties: {}, additionalProperties: true },
          run: (toolInput) => Promise.resolve({ received: toolInput }),
        }),
        defaultEnabled: input.defaultEnabled,
        approvalPolicyIds: input.approvalPolicyIds,
        label: input.label,
      });
    const registry: Record<string, ToolRegistrationFactory> = {
      ...DEFAULT_TOOL_REGISTRATIONS,
      "example.custom": customFactory,
    };

    expect(availableToolNames(registry)).toContain("example.custom");
    const registration = findToolRegistrationFactory("example.custom", registry)?.(INPUT);
    expect(registration?.name).toBe("example.custom");
    // The shipped tool still resolves through the same lookup.
    expect(findToolRegistrationFactory(MOCK_WEB_SEARCH_TOOL_NAME, registry)?.(INPUT)?.name).toBe(
      MOCK_WEB_SEARCH_TOOL_NAME,
    );
  });
});
