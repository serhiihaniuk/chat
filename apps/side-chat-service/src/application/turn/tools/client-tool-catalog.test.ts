import { describe, expect, it } from "vitest";

import { CLIENT_TOOL_CATALOG_LIMITS, hasClientToolNameConflict } from "./client-tool-catalog.js";
import { isSupportedClientToolSchema } from "./client-tool-schema.js";

const openFileTool = {
  name: "open_file",
  description: "Open one file in the host application.",
  inputSchema: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
} as const;

describe("client tool catalog", () => {
  it("detects duplicate and server-shadowing names before admission", () => {
    expect(hasClientToolNameConflict([openFileTool, openFileTool])).toBe(true);
    expect(hasClientToolNameConflict([openFileTool], new Set([openFileTool.name]))).toBe(true);
    expect(hasClientToolNameConflict([openFileTool], new Set(["search_web"]))).toBe(false);
  });

  it("admits the pinned Workflow draft-07 subset and rejects unsupported schema features", () => {
    expect(isSupportedClientToolSchema(openFileTool.inputSchema)).toBe(true);
    expect(
      isSupportedClientToolSchema({
        type: "string",
        pattern: "^[A-Za-z0-9_-]{1,64}$",
      }),
    ).toBe(true);
    expect(isSupportedClientToolSchema({ type: "string", format: "date-time" })).toBe(false);
    expect(
      isSupportedClientToolSchema({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        unevaluatedProperties: false,
      }),
    ).toBe(false);
  });

  it.each([
    [{ type: 123 }, "non-string type"],
    [{ required: [1] }, "non-string required property"],
    [{ maxLength: -1 }, "negative length"],
    [{ multipleOf: 0 }, "non-positive divisor"],
    [{ additionalProperties: "yes" }, "non-schema nested value"],
    [{ enum: [] }, "empty enum"],
    [{ type: ["string", "string"] }, "duplicate union type"],
    [{ $ref: "https://example.com/schema.json" }, "remote reference"],
    [{ pattern: "(a+)+$" }, "nested-quantifier pattern"],
    [{ pattern: "[" }, "invalid pattern"],
  ] as const)("rejects malformed or unsafe keyword values: %s", (schema, _reason) => {
    expect(isSupportedClientToolSchema(schema)).toBe(false);
  });

  it("bounds schema depth, node count, and serialized bytes", () => {
    expect(
      isSupportedClientToolSchema(nestedSchema(CLIENT_TOOL_CATALOG_LIMITS.MAX_SCHEMA_DEPTH)),
    ).toBe(true);
    expect(
      isSupportedClientToolSchema(nestedSchema(CLIENT_TOOL_CATALOG_LIMITS.MAX_SCHEMA_DEPTH + 1)),
    ).toBe(false);

    const tooManyNodes = {
      properties: Object.fromEntries(
        Array.from({ length: 64 }, (_, index) => [
          `group_${index}`,
          {
            properties: Object.fromEntries(
              Array.from({ length: 4 }, (_unused, childIndex) => [
                `value_${childIndex}`,
                { type: "string" },
              ]),
            ),
          },
        ]),
      ),
    };
    expect(isSupportedClientToolSchema(tooManyNodes)).toBe(false);
    expect(
      isSupportedClientToolSchema({
        type: "string",
        description: "x".repeat(CLIENT_TOOL_CATALOG_LIMITS.MAX_SCHEMA_BYTES),
      }),
    ).toBe(false);
  });
});

function nestedSchema(depth: number): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let current = root;
  for (let index = 1; index < depth; index += 1) {
    const child: Record<string, unknown> = {};
    current["not"] = child;
    current = child;
  }
  current["type"] = "string";
  return root;
}
