import { describe, expect, it, vi } from "vitest";

import {
  SERVER_TOOL_APPROVAL_POLICIES,
  defineServerTool,
  type ServerToolTextGenerator,
} from "#application/turn/tools/server-tools/server-tool-catalog";
import { TOOL_APPROVAL_DENIAL_REASONS } from "../../tool-approvals/approval-output.js";
import { isWorkflowRecord } from "../../tool-approvals/workflow-value-guards.js";
import { executeApprovedServerTool } from "./execute-server-tool.js";

type TestServerToolExecute = (
  input: { title: string },
  context: {
    executionKey: string;
    generateText?:
      | ((request: {
          modelId: string;
          system: string;
          prompt: string;
          maxOutputTokens: number;
        }) => Promise<string>)
      | undefined;
  },
) => Promise<unknown>;

const COMMAND = {
  toolName: "jira.create_issue",
  input: { title: "Investigate" },
  executionKey: "turn-1:call-1:sha256:digest",
} as const;

describe("approved server-tool execution step", () => {
  it("denies when the tool was removed while approval was pending", async () => {
    await expect(executeApprovedServerTool(undefined, COMMAND)).resolves.toEqual({
      type: "execution-denied",
      reason: TOOL_APPROVAL_DENIAL_REASONS.TOOL_CHANGED,
    });
  });

  it("denies when current schema or policy no longer matches the approved request", async () => {
    await expect(
      executeApprovedServerTool(tool({ acceptsInput: false }), COMMAND),
    ).resolves.toEqual({
      type: "execution-denied",
      reason: TOOL_APPROVAL_DENIAL_REASONS.SCHEMA_CHANGED,
    });
    await expect(executeApprovedServerTool(tool({ policy: "ungated" }), COMMAND)).resolves.toEqual({
      type: "execution-denied",
      reason: TOOL_APPROVAL_DENIAL_REASONS.POLICY_CHANGED,
    });
  });

  it("executes the current gated definition with the durable execution key", async () => {
    const execute = vi.fn<TestServerToolExecute>(async () => ({
      created: true,
    }));
    await expect(executeApprovedServerTool(tool({ execute }), COMMAND)).resolves.toEqual({
      created: true,
    });
    expect(execute).toHaveBeenCalledWith(COMMAND.input, {
      executionKey: COMMAND.executionKey,
    });
  });

  it("makes the nested model runner available only after current approval policy passes", async () => {
    const generateText = vi.fn<ServerToolTextGenerator>(() => Promise.resolve("model output"));
    const execute = vi.fn<TestServerToolExecute>(async (_input, context) =>
      context.generateText?.({
        modelId: "gpt-5.4-mini",
        system: "system",
        prompt: "query",
        maxOutputTokens: 256,
      }),
    );

    await expect(
      executeApprovedServerTool(tool({ execute }), COMMAND, { generateText }),
    ).resolves.toBe("model output");
    expect(generateText).toHaveBeenCalledOnce();

    await executeApprovedServerTool(tool({ policy: "ungated", execute }), COMMAND, {
      generateText,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(generateText).toHaveBeenCalledTimes(1);
  });
});

function tool(
  options: {
    acceptsInput?: boolean;
    policy?: "always" | "ungated";
    execute?: TestServerToolExecute;
  } = {},
) {
  return defineServerTool<{ title: string }, unknown>({
    name: COMMAND.toolName,
    description: "Create an issue",
    inputSchema: { type: "object" },
    validateInput: (input): input is { title: string } =>
      options.acceptsInput !== false &&
      isWorkflowRecord(input) &&
      typeof input["title"] === "string",
    approvalPolicy: {
      kind:
        options.policy === "ungated"
          ? SERVER_TOOL_APPROVAL_POLICIES.UNGATED
          : SERVER_TOOL_APPROVAL_POLICIES.ALWAYS,
    },
    execute: options.execute ?? (async () => ({ created: true })),
  });
}
