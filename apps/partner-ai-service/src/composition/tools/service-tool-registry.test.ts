import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { RuntimeTool } from "@side-chat/agent-runtime";
import type { ToolCapability } from "@side-chat/partner-ai-core";
import {
  createServiceToolRegistration,
  createServiceToolRegistry,
  ServiceToolRegistryError,
  type ServiceToolRegistration,
} from "./service-tool-registry.js";

const toolCapability = (name: string): ToolCapability => ({
  name,
  description: `${name} capability`,
  inputSchema: { type: "object" },
});

const runtimeTool = (name: string): RuntimeTool => ({
  name,
  description: `${name} runtime tool`,
  inputSchema: { type: "object" },
  execute: () => Effect.succeed({ ok: true }),
});

const registration = (name: string): ServiceToolRegistration =>
  createServiceToolRegistration({
    capability: toolCapability(name),
    runtimeTool: runtimeTool(name),
  });

describe("createServiceToolRegistry", () => {
  it("rejects duplicate tool names", () => {
    expect(() =>
      createServiceToolRegistry([registration("search"), registration("search")]),
    ).toThrow("Duplicate tool search.");
  });

  it("rejects a registration whose capability or runtime tool name drifts from the name", () => {
    const mismatched: ServiceToolRegistration = {
      name: "search",
      capability: toolCapability("search"),
      runtimeTool: runtimeTool("search_runtime"),
      defaultEnabled: true,
      approvalPolicyIds: [],
    };

    expect(() => createServiceToolRegistry([mismatched])).toThrow(ServiceToolRegistryError);
    expect(() => createServiceToolRegistry([mismatched])).toThrow(
      "Tool registration search must match capability search and runtime tool search_runtime.",
    );
  });

  it("splits registrations into manifest capabilities and runtime tools from one source", () => {
    const registry = createServiceToolRegistry([
      registration("search"),
      createServiceToolRegistration({
        capability: toolCapability("create"),
        runtimeTool: runtimeTool("create"),
        defaultEnabled: false,
        approvalPolicyIds: ["create_requires_approval"],
      }),
    ]);

    expect(registry.toolCapabilities.map((capability) => capability.name)).toEqual([
      "search",
      "create",
    ]);
    expect(registry.runtimeTools.map((tool) => tool.name)).toEqual(["search", "create"]);
    expect(registry.defaultEnabledToolNames).toEqual(["search"]);
    expect(registry.status.tools).toEqual([
      { name: "search", defaultEnabled: true, approvalPolicyIds: [] },
      { name: "create", defaultEnabled: false, approvalPolicyIds: ["create_requires_approval"] },
    ]);
  });
});
