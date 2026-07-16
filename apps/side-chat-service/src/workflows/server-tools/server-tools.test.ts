import { beforeEach, describe, expect, it, vi } from "vitest";

import type { runToolApprovalStep } from "../production/approvals/tool-approval.js";
import { TOOL_APPROVAL_STATES } from "#application/ports/turn/tools/tool-approval-store";
import {
  defineServerTool,
  SERVER_TOOL_APPROVAL_POLICIES,
} from "#application/turn/tools/server-tools/server-tool-catalog";
import { toolApprovalSnapshot } from "#testing/tool-approval-fixtures";
import { CHAT_TURN_JOURNAL_PART_TYPES } from "../journal/chat-turn-journal.js";
import {
  deniedToolOutput,
  TOOL_APPROVAL_DENIAL_REASONS,
} from "../tool-approvals/approval-output.js";
import { isWorkflowRecord } from "../tool-approvals/workflow-value-guards.js";

import {
  executeGatedServerTool,
  readServerToolSources,
  writeServerToolSourcesTo,
  type ApprovalGateRuntime,
} from "./index.js";

const approvalStepMock = vi.fn<typeof runToolApprovalStep>();
const createHookMock = vi.fn<ApprovalGateRuntime["createApprovalHook"]>();
const disposeHookMock = vi.fn<() => void>();
const sleepMock = vi.fn<(milliseconds: number) => Promise<void>>();

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
    sleepMock.mockReset();
  });

  it("does not execute before a durable decision", async () => {
    approvalStepMock.mockResolvedValueOnce(REQUESTED).mockResolvedValueOnce(REQUESTED);
    createHookMock.mockReturnValue(pendingHook());
    sleepMock.mockReturnValue(new Promise(() => undefined));
    const execute = vi.fn<TestServerExecute>(async () => ({ created: true }));
    const { request, approvalChunks, dependencies, runtime } = approvalRequest(execute);

    const waiting = executeGatedServerTool(request, dependencies, runtime);
    await vi.waitFor(() => expect(approvalStepMock).toHaveBeenCalledTimes(2));

    expect(execute).not.toHaveBeenCalled();
    expect(approvalChunks).toEqual([
      {
        type: CHAT_TURN_JOURNAL_PART_TYPES.APPROVAL_REQUEST,
        approvalId: REQUESTED.approvalId,
        toolCallId: "call-1",
      },
    ]);
    void waiting;
  });

  it("closes the decision-before-hook-registration race and executes once", async () => {
    approvalStepMock.mockResolvedValueOnce(REQUESTED).mockResolvedValueOnce(
      toolApprovalSnapshot({
        state: TOOL_APPROVAL_STATES.APPROVED,
        approved: true,
      }),
    );
    createHookMock.mockReturnValue(pendingHook());
    const execute = vi.fn<TestServerExecute>(async () => ({ created: true }));

    const { request, dependencies, runtime } = approvalRequest(execute);
    await expect(executeGatedServerTool(request, dependencies, runtime)).resolves.toEqual({
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

      const { request, dependencies, runtime } = approvalRequest(execute);
      await expect(executeGatedServerTool(request, dependencies, runtime)).resolves.toEqual({
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

describe("server-tool source projection", () => {
  it("writes tool-owned URLs as durable native source parts", async () => {
    const sourceChunks: unknown[] = [];
    const writable = new WritableStream({
      write(chunk) {
        sourceChunks.push(chunk);
      },
    });
    const definition = defineServerTool<
      { query: string },
      { results: readonly { title: string; url: string }[] }
    >({
      name: "test_search",
      description: "Test search",
      inputSchema: { type: "object" },
      approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS },
      validateInput: (input): input is { query: string } =>
        typeof input === "object" && input !== null && "query" in input,
      execute: async () => ({ results: [] }),
      readSources: (output) =>
        output.results.map((result) => ({
          label: result.title,
          url: result.url,
        })),
    });

    const sources = readServerToolSources(definition, {
      results: [
        { title: "First source", url: "https://first.test" },
        { title: "Second source", url: "https://second.test" },
      ],
    });
    await writeServerToolSourcesTo(sources, "call-1", writable);

    expect(sourceChunks).toEqual([
      {
        type: "source",
        sourceType: "url",
        id: "call-1:source:1",
        url: "https://first.test",
        title: "First source",
      },
      {
        type: "source",
        sourceType: "url",
        id: "call-1:source:2",
        url: "https://second.test",
        title: "Second source",
      },
    ]);
  });

  it("returns no sources when a tool exposes no source projection", async () => {
    const definition = defineServerTool<{ query: string }, { ok: boolean }>({
      name: "test_tool",
      description: "Test tool",
      inputSchema: { type: "object" },
      approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.UNGATED },
      validateInput: (input): input is { query: string } =>
        typeof input === "object" && input !== null && "query" in input,
      execute: async () => ({ ok: true }),
    });

    const sources = readServerToolSources(definition, { ok: true });

    expect(sources).toEqual([]);
  });

  it("drops unsafe or unbounded model-authored source metadata", () => {
    const definition = defineServerTool<
      { query: string },
      { results: readonly { title: string; url: string }[] }
    >({
      name: "test_search",
      description: "Test search",
      inputSchema: { type: "object" },
      approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS },
      validateInput: (input): input is { query: string } =>
        typeof input === "object" && input !== null && "query" in input,
      execute: async () => ({ results: [] }),
      readSources: (output) =>
        output.results.map((result) => ({
          label: result.title,
          url: result.url,
        })),
    });

    expect(
      readServerToolSources(definition, {
        results: [
          { title: "Safe", url: "https://safe.test/article" },
          { title: "Insecure", url: "http://unsafe.test" },
          { title: "Script", url: "javascript:alert(1)" },
          { title: "Credentials", url: "https://user:secret@unsafe.test" },
          {
            title: "Too long",
            url: `https://unsafe.test/${"x".repeat(2_100)}`,
          },
        ],
      }),
    ).toEqual([{ label: "Safe", url: "https://safe.test/article" }]);
  });

  it("does not project a denied approval as a tool result", async () => {
    const readSources = vi.fn<(output: { results: readonly [] }) => readonly []>(() => []);
    const definition = defineServerTool<{ query: string }, { results: readonly [] }>({
      name: "test_search",
      description: "Test search",
      inputSchema: { type: "object" },
      approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS },
      validateInput: (input): input is { query: string } =>
        typeof input === "object" && input !== null && "query" in input,
      execute: async () => ({ results: [] }),
      readSources,
    });

    const sources = readServerToolSources(
      definition,
      deniedToolOutput(TOOL_APPROVAL_DENIAL_REASONS.DENIED),
    );

    expect(sources).toEqual([]);
    expect(readSources).not.toHaveBeenCalled();
  });
});

function approvalRequest(execute: ReturnType<typeof vi.fn<TestServerExecute>>) {
  const approvalChunks: unknown[] = [];
  const writable = new WritableStream({
    write(chunk) {
      approvalChunks.push(chunk);
    },
  });
  return {
    approvalChunks,
    dependencies: {
      runApprovalStep: approvalStepMock,
      runExecutionStep: async (command: { input: unknown; executionKey: string }) => {
        if (!isIssueInput(command.input)) throw new TypeError("Expected issue input");
        return execute(command.input, { executionKey: command.executionKey });
      },
    },
    runtime: {
      createApprovalHook: createHookMock,
      writeApprovalRequest: async (approvalId: string, toolCallId: string) => {
        const writer = writable.getWriter();
        try {
          await writer.write({
            type: CHAT_TURN_JOURNAL_PART_TYPES.APPROVAL_REQUEST,
            approvalId,
            toolCallId,
          });
        } finally {
          writer.releaseLock();
        }
        return true;
      },
      clock: { now: () => Date.parse(REQUESTED.requestedAt), wait: sleepMock },
    } satisfies ApprovalGateRuntime,
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

function pendingHook(): ReturnType<ApprovalGateRuntime["createApprovalHook"]> {
  return Object.assign(new Promise<true>(() => undefined), {
    token: "approval:run-1:approval-call-1",
    getConflict: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    dispose: disposeHookMock,
    [Symbol.dispose]: disposeHookMock,
    async *[Symbol.asyncIterator]() {},
  });
}
