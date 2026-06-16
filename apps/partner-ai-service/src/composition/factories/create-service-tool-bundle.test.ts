import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  MOCK_WEB_SEARCH_TOOL_NAME,
  createMockWebSearchRegistration,
} from "#adapters/tools/mock-web-search-tool";
import { ServiceToolRegistryError } from "#composition/tools/service-tool-registry";
import { createServiceToolBundle } from "./create-service-tool-bundle.js";

const workspace = { tenantId: "tenant_tool", workspaceId: "workspace_tool" } as const;

describe("createServiceToolBundle", () => {
  it("builds an empty tool surface when no tools are configured", () => {
    const bundle = createServiceToolBundle({ workspace });

    expect(bundle.toolCapabilities).toEqual([]);
    expect(bundle.runtimeTools).toEqual([]);
  });

  it("includes the local mock web search as one capability and executable", () => {
    const bundle = createServiceToolBundle({
      workspace,
      runtime: { provider: "fake", enableMockWebSearch: true },
    });

    expect(bundle.toolCapabilities.map((capability) => capability.name)).toEqual([
      MOCK_WEB_SEARCH_TOOL_NAME,
    ]);
    expect(bundle.runtimeTools.map((tool) => tool.name)).toEqual([MOCK_WEB_SEARCH_TOOL_NAME]);
  });

  it("rejects duplicate tool registrations", () => {
    const duplicate = createMockWebSearchRegistration();

    expect(() =>
      createServiceToolBundle({
        workspace,
        runtime: { provider: "fake", enableMockWebSearch: true, tools: [duplicate] },
      }),
    ).toThrow(ServiceToolRegistryError);
  });

  it("keeps capability and executable from one registration in lockstep", () => {
    const bundle = createServiceToolBundle({
      workspace,
      runtime: {
        provider: "fake",
        tools: [
          {
            name: "weather.lookup",
            capability: {
              name: "weather.lookup",
              description: "Look up the weather.",
              inputSchema: { type: "object" },
            },
            runtimeTool: {
              name: "weather.lookup",
              description: "Look up the weather.",
              inputSchema: { type: "object" },
              execute: () => Effect.succeed({ temperature: 21 }),
            },
            defaultEnabled: true,
            approvalPolicyIds: [],
          },
        ],
      },
    });

    expect(bundle.toolCapabilities.map((capability) => capability.name)).toEqual([
      "weather.lookup",
    ]);
    expect(bundle.runtimeTools.map((tool) => tool.name)).toEqual(["weather.lookup"]);
  });
});
