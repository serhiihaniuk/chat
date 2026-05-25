import { describe, expect, it } from "vitest";
import { AgentRuntimeError } from "../errors.js";
import { createToolRegistry, type RuntimeTool } from "./tool-registry.js";

describe("createToolRegistry", () => {
  const lookupTool: RuntimeTool = {
    name: "lookup",
    description: "Look up deterministic test data.",
    inputSchema: { type: "object", additionalProperties: false },
    run: () => ({ ok: true }),
  };

  it("resolves registered tools", () => {
    const registry = createToolRegistry([lookupTool]);

    expect(registry.resolve("lookup")).toBe(lookupTool);
  });

  it("rejects unavailable tools without fallback", () => {
    const registry = createToolRegistry([lookupTool]);

    expect(() => registry.resolve("missing")).toThrow(AgentRuntimeError);
  });
});
