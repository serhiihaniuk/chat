import {
  HookNotFoundError,
  RunExpiredError,
  WorkflowRunNotFoundError,
} from "workflow/internal/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { runClientToolDispatchStep } from "../production/client-tool-dispatch.js";
import {
  executeClientTool,
  resumeClientToolResult,
  type ClientToolWorkflowDependencies,
} from "./index.js";

const createHookMock = vi.fn<ClientToolWorkflowDependencies["createResultHook"]>();
const dispatchStepMock = vi.fn<typeof runClientToolDispatchStep>();
const disposeHookMock = vi.fn<() => void>();
const resumeHookMock = vi.fn<(token: string, payload: unknown) => Promise<unknown>>();
const neverWait = () => new Promise<void>(() => undefined);
const CLIENT_TOOL_CAPABILITY_DIGEST = "a".repeat(64);

function createHookTestDouble(): ReturnType<ClientToolWorkflowDependencies["createResultHook"]> {
  return Object.assign(new Promise<{ value: { opened: boolean } }>(() => undefined), {
    token: "tool:run-1:call-1",
    getConflict: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    dispose: disposeHookMock,
    [Symbol.dispose]: disposeHookMock,
    async *[Symbol.asyncIterator]() {},
  });
}

describe("resumeClientToolResult", () => {
  beforeEach(() => resumeHookMock.mockReset());

  it("treats only a missing hook as the expected result-before-registration window", async () => {
    resumeHookMock.mockRejectedValueOnce(new HookNotFoundError("tool:run-1:call-1"));

    await expect(
      resumeClientToolResult("run-1", "call-1", { value: { opened: true } }, resumeHookMock),
    ).resolves.toBe(false);
  });

  it("treats a pruned run as a vanished wait rather than a failure", async () => {
    resumeHookMock.mockRejectedValueOnce(new WorkflowRunNotFoundError("run-1"));

    await expect(
      resumeClientToolResult("run-1", "call-1", { value: { opened: true } }, resumeHookMock),
    ).resolves.toBe(false);
  });

  it("treats an expired run as a vanished wait rather than a failure", async () => {
    resumeHookMock.mockRejectedValueOnce(
      new RunExpiredError('Workflow run "run-1" is already in terminal state'),
    );

    await expect(
      resumeClientToolResult("run-1", "call-1", { value: { opened: true } }, resumeHookMock),
    ).resolves.toBe(false);
  });

  it("does not hide Workflow infrastructure failures", async () => {
    const failure = new Error("workflow storage unavailable");
    resumeHookMock.mockRejectedValueOnce(failure);

    await expect(
      resumeClientToolResult("run-1", "call-1", { value: { opened: true } }, resumeHookMock),
    ).rejects.toBe(failure);
  });
});

describe("executeClientTool", () => {
  beforeEach(() => {
    createHookMock.mockReset();
    dispatchStepMock.mockReset();
    disposeHookMock.mockReset();
  });

  it("rereads the durable row after hook registration closes the early-result race", async () => {
    dispatchStepMock.mockResolvedValueOnce({ state: "dispatched" }).mockResolvedValueOnce({
      state: "settled",
      output: { value: { opened: true } },
    });
    createHookMock.mockReturnValue(createHookTestDouble());

    await expect(
      executeClientTool(
        {
          databaseUrl: "postgres://test",
          workspaceId: "workspace-1",
          turnId: "turn-1",
          runId: "run-1",
          timeoutMs: 30_000,
          abortSignal: new AbortController().signal,
          clientToolCapabilityDigest: CLIENT_TOOL_CAPABILITY_DIGEST,
          toolCallId: "call-1",
          toolName: "open_file",
        },
        {
          createResultHook: createHookMock,
          runDispatchStep: dispatchStepMock,
          clock: { now: () => 0, wait: neverWait },
        },
      ),
    ).resolves.toEqual({ opened: true });

    expect(dispatchStepMock).toHaveBeenNthCalledWith(1, {
      operation: "create",
      databaseUrl: "postgres://test",
      dispatch: {
        workspaceId: "workspace-1",
        turnId: "turn-1",
        toolCallId: "call-1",
        toolName: "open_file",
        clientToolCapabilityDigest: CLIENT_TOOL_CAPABILITY_DIGEST,
      },
    });
    expect(dispatchStepMock).toHaveBeenNthCalledWith(2, {
      operation: "read",
      databaseUrl: "postgres://test",
      dispatch: {
        workspaceId: "workspace-1",
        turnId: "turn-1",
        toolCallId: "call-1",
      },
    });
    expect(disposeHookMock).toHaveBeenCalledOnce();
  });
});
