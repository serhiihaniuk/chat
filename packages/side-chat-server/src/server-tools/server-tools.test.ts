import { describe, expect, it, vi } from "vitest";
import { isRecord, type JsonValue } from "@side-chat/shared";

import {
  SERVER_TOOL_APPROVAL_POLICIES,
  defineServerTool,
  requiresServerToolApproval,
  selectServerToolDefinitions,
  toServerToolCatalog,
} from "./index.js";

const readTool = defineServerTool<JsonValue, { readonly ok: true }>({
  name: "read_file",
  description: "Read a file.",
  inputSchema: { type: "object" },
  validateInput: (input): input is JsonValue => input !== undefined,
  approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.UNGATED },
  execute: async () => ({ ok: true }),
});

const writeTool = defineServerTool<JsonValue, { readonly ok: true }>({
  name: "write_file",
  description: "Write a file.",
  inputSchema: { type: "object" },
  validateInput: (input): input is JsonValue => input !== undefined,
  approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS },
  execute: async () => ({ ok: true }),
});

describe("server tool framework contract", () => {
  it("projects the safe picker catalog and narrows explicit selections", () => {
    expect(toServerToolCatalog([{ ...readTool, name: "mockWebSearch" }])).toEqual([
      {
        name: "mockWebSearch",
        label: "Mock web search",
        description: "Read a file.",
        defaultEnabled: true,
      },
    ]);
    expect(selectServerToolDefinitions([readTool, writeTool], undefined)).toEqual([
      readTool,
      writeTool,
    ]);
    expect(selectServerToolDefinitions([readTool, writeTool], ["write_file"])).toEqual([writeTool]);
  });

  it("resolves all approval policy kinds", async () => {
    await expect(
      requiresServerToolApproval({ kind: SERVER_TOOL_APPROVAL_POLICIES.UNGATED }, null),
    ).resolves.toBe(false);
    await expect(
      requiresServerToolApproval({ kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS }, null),
    ).resolves.toBe(true);

    const requiresApproval = vi.fn<(input: { mode: string }) => boolean>(
      (input) => input.mode === "write",
    );
    await expect(
      requiresServerToolApproval(
        { kind: SERVER_TOOL_APPROVAL_POLICIES.PER_INPUT, requiresApproval },
        { mode: "write" },
      ),
    ).resolves.toBe(true);
    expect(requiresApproval).toHaveBeenCalledWith({ mode: "write" });
  });

  it("requires resumable input validation and bounded public metadata", () => {
    const tool = defineServerTool<{ title: string }, { created: string }>({
      name: "create_issue",
      description: "Create one issue.",
      inputSchema: { type: "object", required: ["title"] },
      validateInput: (input): input is { title: string } =>
        isRecord(input) && typeof input["title"] === "string",
      approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS },
      execute: (input) => Promise.resolve({ created: input.title }),
    });

    expect(tool.validateInput({ title: "Investigate" })).toBe(true);
    expect(() => defineServerTool({ ...unsafeTool(), name: " invalid " })).toThrow(TypeError);
    expect(() => defineServerTool({ ...unsafeTool(), validateInput: undefined })).toThrow(
      TypeError,
    );
    expect(() =>
      defineServerTool({ ...unsafeTool(), approvalPolicy: { kind: "sometimes" } }),
    ).toThrow(TypeError);
  });
});

function unsafeTool() {
  return {
    name: "fixture_tool",
    description: "A test-only server tool.",
    inputSchema: { type: "object" },
    validateInput: (input: JsonValue): input is never => input === null,
    approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS },
    execute: () => Promise.resolve({ status: "ok" }),
  };
}
