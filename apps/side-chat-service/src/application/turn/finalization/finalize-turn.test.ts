import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import { DeterministicTurnAdmission } from "#testing/turn/deterministic-turn-admission";
import { TURN_MESSAGE_ROLES, TURN_TERMINAL_STATUSES } from "#domain/turn/turn";

import { finalizeTurn } from "./finalize-turn.js";

const turn = { conversationId: "conversation-1", turnId: "turn-1" };
const assistantMessage: UIMessage = {
  id: "assistant-1",
  role: TURN_MESSAGE_ROLES.ASSISTANT,
  parts: [{ type: "text", text: "Done" }],
};

describe("finalizeTurn", () => {
  it("claims exactly one terminal, sums usage, and persists completed output once", async () => {
    const state = await createState();
    const admission = await admittedLease();
    const input = {
      turn,
      status: TURN_TERMINAL_STATUSES.COMPLETED,
      stepUsage: [
        { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        { inputTokens: 5, outputTokens: 8, totalTokens: 13 },
      ],
      assistantMessage,
      admission: admission.lease,
    } as const;

    await expect(finalizeTurn({ turns: state, messages: state }, input)).resolves.toBe(true);
    await expect(finalizeTurn({ turns: state, messages: state }, input)).resolves.toBe(false);

    expect(state.terminals.get(turn.turnId)?.usage).toEqual({
      inputTokens: 6,
      outputTokens: 10,
      totalTokens: 16,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    });
    expect(state.assistantMessages).toEqual([assistantMessage]);
    expect(admission.admission.released).toBe(1);
  });

  it.each([TURN_TERMINAL_STATUSES.CANCELLED, TURN_TERMINAL_STATUSES.FAILED])(
    "does not persist partial assistant output for %s",
    async (status) => {
      const state = await createState();
      const admission = await admittedLease();
      await finalizeTurn(
        { turns: state, messages: state },
        {
          turn,
          status,
          stepUsage: [],
          assistantMessage,
          admission: admission.lease,
        },
      );
      expect(state.assistantMessages).toEqual([]);
    },
  );

  it("persists an empty assistant message on completed output", async () => {
    const state = await createState();
    const admission = await admittedLease();
    const emptyMessage: UIMessage = {
      id: "assistant-empty",
      role: TURN_MESSAGE_ROLES.ASSISTANT,
      parts: [],
    };
    await finalizeTurn(
      { turns: state, messages: state },
      {
        turn,
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        stepUsage: [],
        assistantMessage: emptyMessage,
        admission: admission.lease,
      },
    );
    expect(state.assistantMessages).toEqual([emptyMessage]);
  });

  it("does not create an assistant message on cancel before output", async () => {
    const state = await createState();
    const admission = await admittedLease();
    await finalizeTurn(
      { turns: state, messages: state },
      {
        turn,
        status: TURN_TERMINAL_STATUSES.CANCELLED,
        stepUsage: [],
        admission: admission.lease,
      },
    );
    expect(state.assistantMessages).toEqual([]);
  });
});

async function admittedLease() {
  const admission = new DeterministicTurnAdmission();
  const lease = await admission.admitTurn();
  return { admission, lease };
}

async function createState(): Promise<InMemoryTurnState> {
  const state = new InMemoryTurnState([
    { conversationId: turn.conversationId, workspaceId: "workspace-1", subjectId: "subject-1" },
  ]);
  await state.beginTurn({
    auth: { workspaceId: "workspace-1", subjectId: "subject-1", issuedAt: "now" },
    conversationId: turn.conversationId,
    requestId: "request-1",
    userMessage: { id: "user-1", role: TURN_MESSAGE_ROLES.USER, text: "Hello" },
  });
  return state;
}
