import { describe, expect, it, vi } from "vitest";

import type { WorkflowChatClient } from "#entities/workflow-chat";

import {
  createWorkflowApprovalDecisionHandler,
  type WorkflowApprovalDecisions,
} from "./workflow-approval.js";

type AddToolApprovalResponse = (options: {
  readonly id: string;
  readonly approved: boolean;
  readonly reason?: string;
}) => Promise<void>;

describe("createWorkflowApprovalDecisionHandler", () => {
  it("deduplicates concurrent clicks and records one denied response after durable acknowledgement", async () => {
    let release: (() => void) | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve(
              Response.json({
                accepted: true,
                approvalId: "approval-1",
                state: "denied",
              }),
            );
        }),
    );
    const addToolApprovalResponse = vi.fn<AddToolApprovalResponse>(() =>
      Promise.resolve(),
    );
    const harness = createHarness(fetch, addToolApprovalResponse);

    const first = harness.handler("approval-1", false, "  not authorized  ");
    const duplicate = harness.handler("approval-1", false, "ignored duplicate");
    await duplicate;
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    release?.();
    await first;

    expect(harness.decisions()).toEqual({ "approval-1": "denied" });
    expect(addToolApprovalResponse).toHaveBeenCalledTimes(1);
    expect(addToolApprovalResponse).toHaveBeenCalledWith({
      id: "approval-1",
      approved: false,
      reason: "not authorized",
    });
  });

  it.each([
    [409, "tool_approval_conflict", "expired"],
    [403, "run_not_found", "foreign"],
  ] as const)(
    "maps a %s decision failure to the calm %s state",
    async (status, code, state) => {
      const fetch = vi.fn<typeof globalThis.fetch>(() =>
        Promise.resolve(
          Response.json(
            { code, message: "safe boundary failure", retryable: false },
            { status },
          ),
        ),
      );
      const addToolApprovalResponse = vi.fn<AddToolApprovalResponse>(() =>
        Promise.resolve(),
      );
      const harness = createHarness(fetch, addToolApprovalResponse);

      await harness.handler("approval-1", true);

      expect(harness.decisions()).toEqual({ "approval-1": state });
      expect(addToolApprovalResponse).not.toHaveBeenCalled();
    },
  );
});

function createHarness(
  fetch: typeof globalThis.fetch,
  addToolApprovalResponse: AddToolApprovalResponse,
) {
  let decisions: WorkflowApprovalDecisions = {};
  const inFlight = new Set<string>();
  const client: WorkflowChatClient = {
    baseUrl: "https://service.example",
    conversationId: "conversation-1",
    fetch,
  };
  const handler = createWorkflowApprovalDecisionHandler({
    activeRunIdRef: { current: "run-1" },
    approvalRequestsInFlightRef: { current: inFlight },
    chat: { addToolApprovalResponse },
    clientRef: { current: client },
    setApprovalDecisions: (update) => {
      decisions = update(decisions);
    },
  });
  return { decisions: () => decisions, handler };
}
