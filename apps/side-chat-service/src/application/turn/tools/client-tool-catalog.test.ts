import { describe, expect, it } from "vitest";

import { hasClientToolNameConflict } from "./client-tool-catalog.js";

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
});
