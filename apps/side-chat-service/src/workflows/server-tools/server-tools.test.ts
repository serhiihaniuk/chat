import type { createHook, getWritable, sleep } from "workflow";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { runToolApprovalStep } from "../production/approvals/tool-approval.js";
import { TOOL_APPROVAL_STATES } from "#application/ports/turn/tools/tool-approval-store";
import { toolApprovalSnapshot } from "#testing/tool-approval-fixtures";
import { TOOL_APPROVAL_DENIAL_REASONS } from "../tool-approvals/approval-output.js";
import { isWorkflowRecord } from "../tool-approvals/workflow-value-guards.js";

const { approvalStepMock, createHookMock, disposeHookMock, getWritableMock, sleepMock } =
  vi.hoisted(() => ({
    approvalStepMock: vi.fn<typeof runToolApprovalStep>(),
    createHookMock: vi.fn<typeof createHook>(),
    disposeHookMock: vi.fn<() => void>(),
    getWritableMock: vi.fn<typeof getWritable>(),
    sleepMock: vi.fn<typeof sleep>(),
  }));

vi.mock("workflow", () => ({
  createHook: createHookMock,
  getWritable: getWritableMock,
  sleep: sleepMock,
}));
vi.mock("../production/approvals/tool-approval.js", () => ({
  runToolApprovalStep: approvalStepMock,
}));

import { executeGatedServerTool, TOOL_APPROVAL_REQUEST_STREAM_PART_TYPE } from "./index.js";

type TestServerExecute = (
  input: { issue: string },
  context: Readonly<{ executionKey: string }>,
) => Promise<{ created: boolean }>;

const REQUESTED = toolApprovalSnapshot();

describe("durable server-tool approval gate", () => {
  beforeEach(() => {
    approvalStepMock.mockReset();
    createHookMock.mockReset();
    disposeHookMock.mockReset();
    getWritableMock.mockReset();
    sleepMock.mockReset();
  });

  it("does not execute before a durable decision", async () => {
    approvalStepMock.mockResolvedValueOnce(REQUESTED).mockResolvedValueOnce(REQUESTED);
    createHookMock.mockReturnValue(pendingHook());
    sleepMock.mockReturnValue(new Promise(() => undefined));
    const execute = vi.fn<TestServerExecute>(async () => ({ created: true }));
    const { request, approvalChunks, dependencies } = approvalRequest(execute);

    const waiting = executeGatedServerTool(request, dependencies);
    await vi.waitFor(() => expect(approvalStepMock).toHaveBeenCalledTimes(2));

    expect(execute).not.toHaveBeenCalled();
    expect(approvalChunks).toEqual([
      {
        type: TOOL_APPROVAL_REQUEST_STREAM_PART_TYPE,
        approvalId: REQUESTED.approvalId,
        toolCallId: "call-1",
      },
    ]);
    void waiting;
  });

  it("closes the decision-before-hook-registration race and executes once", async () => {
    approvalStepMock
      .mockResolvedValueOnce(REQUESTED)
      .mockResolvedValueOnce(
        toolApprovalSnapshot({ state: TOOL_APPROVAL_STATES.APPROVED, approved: true }),
      );
    createHookMock.mockReturnValue(pendingHook());
    const execute = vi.fn<TestServerExecute>(async () => ({ created: true }));

    const { request, dependencies } = approvalRequest(execute);
    await expect(executeGatedServerTool(request, dependencies)).resolves.toEqual({
      created: true,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[1].executionKey).toContain(REQUESTED.inputDigest);
    expect(disposeHookMock).toHaveBeenCalledOnce();
  });

  it.each([TOOL_APPROVAL_STATES.DENIED, TOOL_APPROVAL_STATES.EXPIRED] as const)(
    "returns a native-normalizable %s result",
    async (state) => {
      approvalStepMock.mockResolvedValueOnce(toolApprovalSnapshot({ state }));
      const execute = vi.fn<TestServerExecute>(async () => ({ created: true }));

      const { request, dependencies } = approvalRequest(execute);
      await expect(executeGatedServerTool(request, dependencies)).resolves.toEqual({
        type: "execution-denied",
        reason:
          state === TOOL_APPROVAL_STATES.EXPIRED
            ? TOOL_APPROVAL_DENIAL_REASONS.EXPIRED
            : TOOL_APPROVAL_DENIAL_REASONS.DENIED,
      });
      expect(execute).not.toHaveBeenCalled();
    },
  );
});

function approvalRequest(execute: ReturnType<typeof vi.fn<TestServerExecute>>) {
  const approvalChunks: unknown[] = [];
  const writable = new WritableStream({
    write(chunk) {
      approvalChunks.push(chunk);
    },
  });
  getWritableMock.mockReturnValue(writable);
  return {
    approvalChunks,
    dependencies: {
      runApprovalStep: approvalStepMock,
      runExecutionStep: async (command: { input: unknown; executionKey: string }) => {
        if (!isIssueInput(command.input)) throw new TypeError("Expected issue input");
        return execute(command.input, { executionKey: command.executionKey });
      },
    },
    request: {
      toolName: REQUESTED.toolName,
      input: { issue: "Investigate" },
      databaseUrl: "postgres://test",
      workspaceId: REQUESTED.workspaceId,
      subjectId: REQUESTED.subjectId,
      conversationId: REQUESTED.conversationId,
      turnId: REQUESTED.turnId,
      runId: REQUESTED.runId,
      toolCallId: REQUESTED.toolCallId,
      providerTimeout: {
        suspend: () => ({ release: vi.fn<() => void>() }),
        waitUntilElapsed: vi.fn<() => Promise<void>>(),
      },
      abortSignal: new AbortController().signal,
    },
  };
}

function isIssueInput(value: unknown): value is { issue: string } {
  return isWorkflowRecord(value) && "issue" in value && typeof value["issue"] === "string";
}

function pendingHook(): ReturnType<typeof createHook> {
  return Object.assign(new Promise<unknown>(() => undefined), {
    token: "approval:run-1:approval-call-1",
    getConflict: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    dispose: disposeHookMock,
    [Symbol.dispose]: disposeHookMock,
    async *[Symbol.asyncIterator]() {},
  });
}
