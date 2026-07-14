import { describe, expect, it } from "vitest";

import { resolveWorkflowRecoveryValidation } from "./workflow-recovery-validation.js";

const CURSOR = { conversationId: "conversation-1", runId: "run-1" };
const ACTIVE_TURN = { turnId: "turn-1", runId: "run-1" };

describe("workflow recovery cursor validation", () => {
  it("reattaches only when service discovery confirms the cursor run", () => {
    expect(
      resolveWorkflowRecoveryValidation({
        activeConversationId: "conversation-1",
        activeTurn: ACTIVE_TURN,
        cursor: CURSOR,
        discoveryFailed: false,
        discoverySettled: true,
        needsValidation: true,
      }),
    ).toEqual({ activeTurn: ACTIVE_TURN, invalidCursor: undefined, isPending: false });
  });

  it("rejects absent and mismatched active runs instead of choosing another conversation", () => {
    for (const activeTurn of [null, { turnId: "turn-2", runId: "run-2" }]) {
      expect(
        resolveWorkflowRecoveryValidation({
          activeConversationId: "conversation-1",
          activeTurn,
          cursor: CURSOR,
          discoveryFailed: false,
          discoverySettled: true,
          needsValidation: true,
        }),
      ).toEqual({ activeTurn: undefined, invalidCursor: CURSOR, isPending: true });
    }
  });

  it("retains the cursor when discovery itself fails", () => {
    expect(
      resolveWorkflowRecoveryValidation({
        activeConversationId: "conversation-1",
        activeTurn: undefined,
        cursor: CURSOR,
        discoveryFailed: true,
        discoverySettled: false,
        needsValidation: true,
      }),
    ).toEqual({ activeTurn: undefined, invalidCursor: undefined, isPending: false });
  });
});
