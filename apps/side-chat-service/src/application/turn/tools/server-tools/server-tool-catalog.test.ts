import { describe, expect, it, vi } from "vitest";
import { isRecord, type JsonValue } from "@side-chat/shared";

import {
  SERVER_TOOL_APPROVAL_POLICIES,
  defineServerTool,
  requiresServerToolApproval,
} from "./server-tool-catalog.js";

describe("server tool approval policy", () => {
  it("resolves explicit ungated and always-gated classifications", async () => {
    await expect(
      requiresServerToolApproval(
        { kind: SERVER_TOOL_APPROVAL_POLICIES.UNGATED },
        { query: "safe" },
      ),
    ).resolves.toBe(false);
    await expect(
      requiresServerToolApproval(
        { kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS },
        { issue: "mutating" },
      ),
    ).resolves.toBe(true);
  });

  it("supports synchronous and asynchronous per-input decisions", async () => {
    const synchronousPolicy = {
      kind: SERVER_TOOL_APPROVAL_POLICIES.PER_INPUT,
      requiresApproval: (input: { mode: string }) => input.mode === "write",
    } as const;
    const asynchronousPolicy = {
      kind: SERVER_TOOL_APPROVAL_POLICIES.PER_INPUT,
      requiresApproval: vi.fn<(input: { count: number }) => Promise<boolean>>((input) =>
        Promise.resolve(input.count > 10),
      ),
    } as const;

    await expect(requiresServerToolApproval(synchronousPolicy, { mode: "read" })).resolves.toBe(
      false,
    );
    await expect(requiresServerToolApproval(synchronousPolicy, { mode: "write" })).resolves.toBe(
      true,
    );
    await expect(requiresServerToolApproval(asynchronousPolicy, { count: 11 })).resolves.toBe(true);
    expect(asynchronousPolicy.requiresApproval).toHaveBeenCalledWith({ count: 11 });
  });

  it("requires a runtime input predicate for revalidation after resume", () => {
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
    expect(tool.validateInput({ title: 42 })).toBe(false);
  });

  it("rejects missing, unknown, and incomplete classifications at runtime", () => {
    expect(() => defineServerTool(unsafeTool(undefined))).toThrow(TypeError);
    expect(() => defineServerTool(unsafeTool({ kind: "sometimes" }))).toThrow(TypeError);
    expect(() =>
      defineServerTool(unsafeTool({ kind: SERVER_TOOL_APPROVAL_POLICIES.PER_INPUT })),
    ).toThrow(TypeError);
  });

  it("rejects a missing runtime input predicate", () => {
    const tool = unsafeTool({ kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS });
    expect(() => defineServerTool({ ...tool, validateInput: undefined })).toThrow(TypeError);
  });
});

function unsafeTool(approvalPolicy: unknown) {
  return {
    name: "fixture_tool",
    description: "A test-only server tool.",
    inputSchema: { type: "object" },
    validateInput: (input: JsonValue): input is never => input === null,
    approvalPolicy,
    execute: () => Promise.resolve({ status: "ok" }),
  };
}
