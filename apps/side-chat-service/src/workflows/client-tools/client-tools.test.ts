import {
  HookNotFoundError,
  RunExpiredError,
  WorkflowRunNotFoundError,
} from "workflow/internal/errors";
import type { createHook, sleep } from "workflow";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { runClientToolDispatchStep } from "../production/client-tool-dispatch.js";

const { createHookMock, dispatchStepMock, disposeHookMock, resumeHookMock } = vi.hoisted(() => ({
  createHookMock: vi.fn<typeof createHook>(),
  dispatchStepMock: vi.fn<typeof runClientToolDispatchStep>(),
  disposeHookMock: vi.fn<() => void>(),
  resumeHookMock: vi.fn<(token: string, payload: unknown) => Promise<unknown>>(),
}));

vi.mock("workflow", () => ({
  createHook: createHookMock,
  sleep: vi.fn<typeof sleep>(),
}));
vi.mock("workflow/api", () => ({ resumeHook: resumeHookMock }));
vi.mock("../production/client-tool-dispatch.js", () => ({
  runClientToolDispatchStep: dispatchStepMock,
}));

import { executeClientTool, resumeClientToolResult } from "./index.js";

function createHookTestDouble(): ReturnType<typeof createHook> {
  return Object.assign(new Promise<unknown>(() => undefined), {
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
      resumeClientToolResult("run-1", "call-1", { value: { opened: true } }),
    ).resolves.toBe(false);
  });

  it("treats a pruned run as a vanished wait rather than a failure", async () => {
    resumeHookMock.mockRejectedValueOnce(new WorkflowRunNotFoundError("run-1"));

    await expect(
      resumeClientToolResult("run-1", "call-1", { value: { opened: true } }),
    ).resolves.toBe(false);
  });

  it("treats an expired run as a vanished wait rather than a failure", async () => {
    resumeHookMock.mockRejectedValueOnce(
      new RunExpiredError('Workflow run "run-1" is already in terminal state'),
    );

    await expect(
      resumeClientToolResult("run-1", "call-1", { value: { opened: true } }),
    ).resolves.toBe(false);
  });

  it("does not hide Workflow infrastructure failures", async () => {
    const failure = new Error("workflow storage unavailable");
    resumeHookMock.mockRejectedValueOnce(failure);

    await expect(
      resumeClientToolResult("run-1", "call-1", { value: { opened: true } }),
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
      executeClientTool({
        databaseUrl: "postgres://test",
        workspaceId: "workspace-1",
        turnId: "turn-1",
        runId: "run-1",
        timeoutMs: 30_000,
        abortSignal: new AbortController().signal,
        toolCallId: "call-1",
        toolName: "open_file",
      }),
    ).resolves.toEqual({ opened: true });

    expect(dispatchStepMock).toHaveBeenNthCalledWith(1, {
      operation: "create",
      databaseUrl: "postgres://test",
      dispatch: {
        workspaceId: "workspace-1",
        turnId: "turn-1",
        toolCallId: "call-1",
        toolName: "open_file",
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
