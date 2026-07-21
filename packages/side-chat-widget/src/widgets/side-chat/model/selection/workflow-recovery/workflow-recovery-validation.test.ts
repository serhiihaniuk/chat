import { describe, expect, it } from "vitest";

import { resolveWorkflowRecoveryValidation } from "./workflow-recovery-validation.js";

const SCOPE_KEY = "test-scope";
const CURSOR = { conversationId: "conversation-1", runId: "run-1", scopeKey: SCOPE_KEY };
const ACTIVE_TURN = { turnId: "turn-1", runId: "run-1" };

describe("workflow recovery cursor validation", () => {
  it("reattaches only when service discovery confirms the cursor run", () => {
    expect(
      resolveWorkflowRecoveryValidation({
        activeConversationId: "conversation-1",
        activeScopeKey: SCOPE_KEY,
        activeTurn: ACTIVE_TURN,
        cursor: CURSOR,
        discoveryFailed: false,
        discoverySettled: true,
        needsValidation: true,
      }),
    ).toEqual({ activeTurn: ACTIVE_TURN, invalidCursor: undefined, isPending: false });
  });

  it("settles an absent run as an invalid cursor without leaving recovery pending", () => {
    expect(
      resolveWorkflowRecoveryValidation({
        activeConversationId: "conversation-1",
        activeScopeKey: SCOPE_KEY,
        activeTurn: null,
        cursor: CURSOR,
        discoveryFailed: false,
        discoverySettled: true,
        needsValidation: true,
      }),
    ).toEqual({ activeTurn: undefined, invalidCursor: CURSOR, isPending: false });
  });

  it("prefers the selected conversation's authoritative active run over a stale cursor", () => {
    const activeTurn = { turnId: "turn-2", runId: "run-2" };

    expect(
      resolveWorkflowRecoveryValidation({
        activeConversationId: "conversation-1",
        activeScopeKey: SCOPE_KEY,
        activeTurn,
        cursor: CURSOR,
        discoveryFailed: false,
        discoverySettled: true,
        needsValidation: true,
      }),
    ).toEqual({ activeTurn, invalidCursor: CURSOR, isPending: false });
  });

  it("retains the cursor when discovery itself fails", () => {
    expect(
      resolveWorkflowRecoveryValidation({
        activeConversationId: "conversation-1",
        activeScopeKey: SCOPE_KEY,
        activeTurn: undefined,
        cursor: CURSOR,
        discoveryFailed: true,
        discoverySettled: false,
        needsValidation: true,
      }),
    ).toEqual({ activeTurn: undefined, invalidCursor: undefined, isPending: false });
  });
});
