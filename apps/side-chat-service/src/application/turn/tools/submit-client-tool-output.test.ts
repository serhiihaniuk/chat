import { describe, expect, it, vi } from "vitest";

import {
  CLIENT_TOOL_OUTPUT_STATES,
  type ClientToolDispatchStore,
} from "#application/ports/turn/tools/client-tool-dispatch-store";

import { submitClientToolOutput, type ResumeClientTool } from "./submit-client-tool-output.js";
import { TURN_REJECTION_CODES } from "../turn-errors.js";

const AUTH = {
  workspaceId: "workspace-1",
  subjectId: "subject-1",
  issuedAt: "now",
} as const;
const DISPATCH = {
  workspaceId: AUTH.workspaceId,
  turnId: "turn-1",
  runId: "run-1",
  toolCallId: "call-1",
} as const;
const OUTPUT = { value: { changed: true } } as const;

describe("submitClientToolOutput", () => {
  it("proves ownership before reading private output and resumes after persistence", async () => {
    const calls: string[] = [];
    const store: ClientToolDispatchStore = {
      findOwned: async () => {
        calls.push("ownership");
        return DISPATCH;
      },
      submit: async (_dispatch, state) => {
        calls.push(`persist:${state}`);
        return { disposition: "accepted", state: "settled", output: OUTPUT };
      },
    };
    const resume = vi.fn<ResumeClientTool>(async () => {
      calls.push("resume");
      return true;
    });

    const result = await submitClientToolOutput(store, resume, {
      auth: AUTH,
      runId: DISPATCH.runId,
      toolCallId: DISPATCH.toolCallId,
      readOutput: async () => {
        calls.push("body");
        return { valid: true, output: OUTPUT };
      },
    });

    expect(calls).toEqual(["ownership", "body", "persist:settled", "resume"]);
    expect(result).toEqual({
      runId: "run-1",
      toolCallId: "call-1",
      state: "settled",
      accepted: true,
    });
    expect(resume).toHaveBeenCalledWith("run-1", "call-1", OUTPUT);
  });

  it("stores malformed bodies as a typed failed model output", async () => {
    const submit = vi.fn<ClientToolDispatchStore["submit"]>(async (_dispatch, state, output) => ({
      disposition: "accepted",
      state,
      output,
    }));
    await expect(
      submitClientToolOutput({ findOwned: async () => DISPATCH, submit }, async () => true, {
        auth: AUTH,
        runId: DISPATCH.runId,
        toolCallId: DISPATCH.toolCallId,
        readOutput: async () => ({
          valid: false,
          output: {
            value: {
              status: "failed",
              errorCode: "invalid_client_tool_output",
            },
          },
        }),
      }),
    ).resolves.toMatchObject({ state: CLIENT_TOOL_OUTPUT_STATES.FAILED });

    expect(submit.mock.calls[0]?.[1]).toBe(CLIENT_TOOL_OUTPUT_STATES.FAILED);
  });

  it("returns the recorded outcome for a duplicate after settle without resuming", async () => {
    const resume = vi.fn<ResumeClientTool>(async () => false);
    const result = await submitClientToolOutput(
      {
        findOwned: async () => DISPATCH,
        submit: async () => ({
          disposition: "duplicate",
          state: "settled",
          output: OUTPUT,
        }),
      },
      resume,
      {
        auth: AUTH,
        runId: DISPATCH.runId,
        toolCallId: DISPATCH.toolCallId,
        readOutput: async () => ({ valid: true, output: OUTPUT }),
      },
    );

    expect(result).toEqual({
      runId: DISPATCH.runId,
      toolCallId: DISPATCH.toolCallId,
      state: "settled",
      accepted: false,
    });
    expect(resume).not.toHaveBeenCalled();
  });

  it("asks the first writer to retry when its hook is not yet registered", async () => {
    await expect(
      submitClientToolOutput(
        {
          findOwned: async () => DISPATCH,
          submit: async () => ({
            disposition: "accepted",
            state: "settled",
            output: OUTPUT,
          }),
        },
        async () => false,
        {
          auth: AUTH,
          runId: DISPATCH.runId,
          toolCallId: DISPATCH.toolCallId,
          readOutput: async () => ({ valid: true, output: OUTPUT }),
        },
      ),
    ).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.CLIENT_TOOL_NOT_READY,
      retryAfterSeconds: 1,
    });
  });

  it("never resumes late results", async () => {
    const resume = vi.fn<ResumeClientTool>(async () => false);
    const result = await submitClientToolOutput(
      {
        findOwned: async () => DISPATCH,
        submit: async () => ({
          disposition: "late",
          state: "late",
          output: OUTPUT,
        }),
      },
      resume,
      {
        auth: AUTH,
        runId: DISPATCH.runId,
        toolCallId: DISPATCH.toolCallId,
        readOutput: async () => ({ valid: true, output: OUTPUT }),
      },
    );

    expect(result.state).toBe("late");
    expect(resume).not.toHaveBeenCalled();
  });
});
