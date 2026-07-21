import { describe, expect, it, vi } from "vitest";

import type { WorkflowChatClient } from "#entities/workflow-chat";
import { resolveWorkflowApprovalDecision } from "./workflow-approval.js";

describe("resolveWorkflowApprovalDecision", () => {
  it("returns the durable acknowledgement without mutating a local chat store", async () => {
    let requestBody: unknown;
    const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Promise.resolve(
        Response.json({ accepted: true, approvalId: "approval-1", state: "denied" }),
      );
    });

    const decision = await resolveWorkflowApprovalDecision({
      approvalId: "approval-1",
      approved: false,
      client: createClient(fetch),
      runId: "run-1",
    });

    expect(decision).toBe("denied");
    expect(requestBody).toEqual({ approved: false });
  });

  it.each([
    [409, "conflict", "expired"],
    [403, "forbidden", "foreign"],
  ] as const)("maps a %s decision failure to the calm %s state", async (status, code, state) => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        Response.json({ code, message: "safe boundary failure", retryable: false }, { status }),
      ),
    );

    const decision = await resolveWorkflowApprovalDecision({
      approvalId: "approval-1",
      approved: true,
      client: createClient(fetch),
      runId: "run-1",
    });

    expect(decision).toBe(state);
  });
});

function createClient(fetch: typeof globalThis.fetch): WorkflowChatClient {
  return {
    baseUrl: "https://service.example",
    scopeKey: "test-scope",
    fetch,
  };
}
