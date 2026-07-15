import { describe, expect, it, vi } from "vitest";

import { HTTP_ERROR } from "#adapters/http/error-response";
import { CHAT_HTTP_ROUTES } from "#adapters/http/http-contract";
import {
  TOOL_APPROVAL_LOOKUP,
  type ToolApprovalDecisionStore,
} from "#application/ports/turn/tools/tool-approval-store";
import { createServiceTestHarness } from "#composition/route/testing-harness/service-test-harness";
import { fakeToolApprovalDecisionStore, toolApprovalRef } from "#testing/tool-approval-fixtures";

const approval = toolApprovalRef();

describe("tool approval route", () => {
  it("returns an idempotent acknowledgement for a binary decision", async () => {
    const resume = vi.fn(async () => false);
    const harness = await createServiceTestHarness({
      toolApprovals: fakeToolApprovalDecisionStore(),
      resumeToolApproval: resume,
    });
    try {
      const response = await harness.request(approvalRoute(), {
        method: "POST",
        body: JSON.stringify({ approved: true }),
      });
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(JSON.parse(body)).toMatchObject({ accepted: true, resumed: false, state: "approved" });
      expect(resume).toHaveBeenCalledOnce();
    } finally {
      await harness.close();
    }
  });

  it("hides unknown approval identities without attempting a decision", async () => {
    const decide = vi.fn<ToolApprovalDecisionStore["decideApproval"]>();
    const harness = await createServiceTestHarness({
      toolApprovals: fakeToolApprovalDecisionStore({
        lookup: TOOL_APPROVAL_LOOKUP.NOT_FOUND,
        decideApproval: decide,
      }),
    });
    try {
      const response = await harness.request(approvalRoute(), {
        method: "POST",
        body: JSON.stringify({ approved: true }),
      });
      expect(response.status).toBe(HTTP_ERROR.NOT_FOUND.STATUS);
      expect(decide).not.toHaveBeenCalled();
    } finally {
      await harness.close();
    }
  });

  it.each([
    ["invalid JSON", "not-json"],
    ["invalid shape", JSON.stringify({ approved: "yes" })],
    ["unsupported reason", JSON.stringify({ approved: true, reason: "not supported" })],
  ])("rejects %s without deciding", async (_label, body) => {
    const decide = vi.fn<ToolApprovalDecisionStore["decideApproval"]>();
    const harness = await createServiceTestHarness({
      toolApprovals: fakeToolApprovalDecisionStore({ decideApproval: decide }),
    });
    try {
      const response = await harness.request(approvalRoute(), { method: "POST", body });
      expect(response.status).toBe(HTTP_ERROR.BAD_REQUEST.STATUS);
      expect(decide).not.toHaveBeenCalled();
    } finally {
      await harness.close();
    }
  });
});

function approvalRoute(): string {
  return CHAT_HTTP_ROUTES.TOOL_APPROVAL.replace(":runId", approval.runId).replace(
    ":approvalId",
    approval.approvalId,
  );
}
