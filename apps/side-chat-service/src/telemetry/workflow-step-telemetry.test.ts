import { describe, expect, it } from "vitest";

import type { ClientToolWorkflowStore } from "#application/ports/turn/tools/client-tool-dispatch-store";
import type { ToolApprovalWorkflowStore } from "#application/ports/turn/tools/tool-approval-store";
import { createCollectingTelemetrySink } from "#testing/collecting-telemetry-sink";
import { runToolApprovalStep } from "#workflows/production/approvals/tool-approval";
import { runClientToolDispatchStep } from "#workflows/production/client-tool-dispatch";

describe("Workflow step telemetry", () => {
  it("records client-tool wait start, timeout, and cancellation without payloads or ids", async () => {
    const telemetry = createCollectingTelemetrySink();
    const snapshots = ["dispatched", "timed_out", "aborted"] as const;

    for (const [index, state] of snapshots.entries()) {
      await runClientToolDispatchStep(clientToolCommand(index), {
        createStore: () => clientToolStore(state),
        telemetry,
      });
    }

    expect(telemetry.records).toEqual([
      {
        type: "client_tool.wait",
        labels: {
          operation: "client_tool_wait",
          outcomeTag: "started",
          toolName: "open_resource",
        },
        count: 1,
      },
      {
        type: "client_tool.wait",
        labels: { operation: "client_tool_wait", outcomeTag: "timed_out" },
        count: 1,
      },
      {
        type: "client_tool.wait",
        labels: { operation: "client_tool_wait", outcomeTag: "cancelled" },
        count: 1,
      },
    ]);
    expect(JSON.stringify(telemetry.records)).not.toContain("private-output");
    expect(JSON.stringify(telemetry.records)).not.toContain("tool-call-private");
  });

  it("records approval request and expiry and contains a throwing sink", async () => {
    const telemetry = createCollectingTelemetrySink();
    const requested = await runToolApprovalStep(approvalCreateCommand(), {
      createStore: () => approvalStore(),
      telemetry,
    });
    const expired = await runToolApprovalStep(approvalExpireCommand(), {
      createStore: () => approvalStore(),
      telemetry: {
        record: (record) => {
          telemetry.record(record);
          throw new Error("telemetry failed");
        },
      },
    });

    expect(requested?.state).toBe("requested");
    expect(expired?.state).toBe("expired");
    expect(telemetry.records).toEqual([
      {
        type: "tool_approval.wait",
        labels: {
          operation: "tool_approval_wait",
          outcomeTag: "requested",
          toolName: "delete_record",
        },
        count: 1,
      },
      {
        type: "tool_approval.wait",
        labels: {
          operation: "tool_approval_wait",
          outcomeTag: "expired",
          toolName: "delete_record",
        },
        count: 1,
      },
    ]);
    expect(JSON.stringify(telemetry.records)).not.toContain("approval-private-input");
  });
});

function clientToolCommand(index: number) {
  const identity = {
    workspaceId: "workspace-private",
    turnId: "turn-private",
    toolCallId: "tool-call-private",
  };
  if (index === 0) {
    return {
      operation: "create",
      databaseUrl: "postgres://private",
      dispatch: {
        ...identity,
        toolName: "open_resource",
        clientToolCapabilityDigest: "digest-private",
      },
    } as const;
  }
  return {
    operation: index === 1 ? "timeout" : "abort",
    databaseUrl: "postgres://private",
    dispatch: identity,
    output: { value: "private-output" },
  } as const;
}

function clientToolStore(
  state: "dispatched" | "timed_out" | "aborted",
): ClientToolWorkflowStore & Readonly<{ close: () => Promise<void> }> {
  const snapshot = { state, output: { value: "private-output" } };
  return {
    create: () => Promise.resolve(snapshot),
    read: () => Promise.resolve(snapshot),
    claimTimeout: () => Promise.resolve(snapshot),
    claimAbort: () => Promise.resolve(snapshot),
    close: () => Promise.resolve(),
  };
}

function approvalCreateCommand() {
  return {
    operation: "create",
    databaseUrl: "postgres://private",
    identity: approvalIdentityWithoutDigest(),
    input: { value: "approval-private-input" },
    timeoutMs: 1_000,
  } as const;
}

function approvalExpireCommand() {
  return {
    operation: "expire",
    databaseUrl: "postgres://private",
    identity: { ...approvalIdentityWithoutDigest(), inputDigest: "digest-private" },
  } as const;
}

function approvalIdentityWithoutDigest() {
  return {
    workspaceId: "workspace-private",
    subjectId: "subject-private",
    conversationId: "conversation-private",
    turnId: "turn-private",
    runId: "run-private",
    approvalId: "approval-private",
    toolCallId: "tool-call-private",
    toolName: "delete_record",
  };
}

function approvalStore(): ToolApprovalWorkflowStore & Readonly<{ close: () => Promise<void> }> {
  return {
    createApproval: (request) => Promise.resolve({ ...request, state: "requested" }),
    readApproval: () => Promise.resolve(undefined),
    expireApproval: (identity) =>
      Promise.resolve({
        ...identity,
        requestedAt: "2026-07-16T00:00:00.000Z",
        expiresAt: "2026-07-17T00:00:00.000Z",
        state: "expired",
      }),
    close: () => Promise.resolve(),
  };
}
