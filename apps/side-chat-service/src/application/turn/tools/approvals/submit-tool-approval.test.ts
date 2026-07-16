import { describe, expect, it, vi } from "vitest";

import {
  TOOL_APPROVAL_LOOKUP,
  type ToolApprovalDecisionStore,
} from "#application/ports/turn/tools/tool-approval-store";
import type { TelemetryRecord } from "#application/ports/telemetry-sink";
import { TURN_REJECTION_CODES } from "#application/turn/turn-errors";
import {
  fakeToolApprovalDecisionStore,
  toolApprovalDecisionResult,
  toolApprovalRef,
} from "#testing/tool-approval-fixtures";

import { submitToolApproval, type ResumeToolApproval } from "./submit-tool-approval.js";

const approval = toolApprovalRef();
const AUTH = {
  workspaceId: approval.workspaceId,
  subjectId: approval.subjectId,
  issuedAt: "now",
} as const;

describe("submitToolApproval", () => {
  it("proves ownership before reading, persists before waking, and tolerates an early decision", async () => {
    const calls: string[] = [];
    const records: TelemetryRecord[] = [];
    const store: ToolApprovalDecisionStore = {
      findOwnedApproval: async () => {
        calls.push("ownership");
        return approval;
      },
      decideApproval: async () => {
        calls.push("persist");
        return toolApprovalDecisionResult();
      },
    };
    const result = await submitToolApproval(
      store,
      async () => {
        calls.push("resume");
        return false;
      },
      {
        ...request(async () => {
          calls.push("body");
          return { valid: true, approved: true };
        }),
        telemetry: { record: (record) => void records.push(record) },
      },
    );

    expect(calls).toEqual(["ownership", "body", "persist", "resume"]);
    expect(result).toEqual({
      runId: approval.runId,
      approvalId: approval.approvalId,
      state: "approved",
      accepted: true,
      resumed: false,
    });
    expect(records).toEqual([
      {
        type: "tool_approval.decision",
        labels: {
          operation: "tool_approval_decision",
          outcomeTag: "approved",
          toolName: approval.toolName,
        },
        count: 1,
      },
    ]);
  });

  it("retries the hook wake for an exact duplicate without changing the decision", async () => {
    const resume = vi.fn<ResumeToolApproval>(async () => true);
    const records: TelemetryRecord[] = [];
    const result = await submitToolApproval(
      fakeToolApprovalDecisionStore({
        result: toolApprovalDecisionResult({
          disposition: "duplicate",
          state: "denied",
        }),
      }),
      resume,
      {
        ...request(async () => ({ valid: true, approved: false })),
        telemetry: { record: (record) => void records.push(record) },
      },
    );
    expect(result).toMatchObject({
      accepted: false,
      resumed: true,
      state: "denied",
    });
    expect(resume).toHaveBeenCalledWith(approval.runId, approval.approvalId);
    expect(records).toContainEqual({
      type: "tool_approval.decision",
      labels: {
        operation: "tool_approval_decision",
        outcomeTag: "denied",
        toolName: approval.toolName,
      },
      count: 1,
    });
  });

  it.each(["conflict", "late"] as const)(
    "rejects a %s decision without waking",
    async (disposition) => {
      const resume = vi.fn<ResumeToolApproval>();
      const records: TelemetryRecord[] = [];
      await expect(
        submitToolApproval(
          fakeToolApprovalDecisionStore({
            result: toolApprovalDecisionResult({
              disposition,
              state: "expired",
            }),
          }),
          resume,
          {
            ...request(async () => ({ valid: true, approved: true })),
            telemetry: { record: (record) => void records.push(record) },
          },
        ),
      ).rejects.toMatchObject({
        code: TURN_REJECTION_CODES.TOOL_APPROVAL_CONFLICT,
      });
      expect(resume).not.toHaveBeenCalled();
      expect(records).toEqual([
        {
          type: "tool_approval.decision",
          labels: {
            operation: "tool_approval_decision",
            outcomeTag: disposition,
            toolName: approval.toolName,
          },
          count: 1,
        },
      ]);
    },
  );

  it("does not read a body for an unknown approval", async () => {
    const readDecision = vi.fn<Parameters<typeof submitToolApproval>[2]["readDecision"]>(() =>
      Promise.resolve({ valid: true, approved: true }),
    );
    await expect(
      submitToolApproval(
        fakeToolApprovalDecisionStore({
          lookup: TOOL_APPROVAL_LOOKUP.NOT_FOUND,
          decideApproval: vi.fn<ToolApprovalDecisionStore["decideApproval"]>(),
        }),
        async () => false,
        request(readDecision),
      ),
    ).rejects.toMatchObject({ code: TURN_REJECTION_CODES.RUN_NOT_FOUND });
    expect(readDecision).not.toHaveBeenCalled();
  });
});

function request(readDecision: Parameters<typeof submitToolApproval>[2]["readDecision"]) {
  return {
    auth: AUTH,
    runId: approval.runId,
    approvalId: approval.approvalId,
    requestId: "request-1",
    readDecision,
  };
}
