import { describe, expect, it } from "vitest";

import { TURN_MESSAGE_ROLES } from "#domain/turn/turn";

import { InMemoryTurnState } from "./in-memory-turn-state.js";

const AUTH = {
  workspaceId: "workspace-1",
  subjectId: "subject-1",
  issuedAt: "now",
} as const;

const USER_MESSAGE = {
  id: "user-1",
  role: TURN_MESSAGE_ROLES.USER,
  text: "Hello",
} as const;

describe("InMemoryTurnState", () => {
  it("rejects an unknown conversation without persisting residue", async () => {
    const state = new InMemoryTurnState([]);

    await expect(state.beginTurn(beginInput())).rejects.toMatchObject({
      code: "conversation_not_found",
    });
    expect(state.userMessages).toEqual([]);
    expect(state.runningTurns.size).toBe(0);
  });

  it("rejects a mismatched owner without persisting residue", async () => {
    const state = seededState();

    await expect(
      state.beginTurn({
        auth: {
          workspaceId: AUTH.workspaceId,
          subjectId: "another-subject",
          issuedAt: AUTH.issuedAt,
        },
        conversationId: "conversation-1",
        requestId: "request-1",
        userMessage: USER_MESSAGE,
      }),
    ).rejects.toMatchObject({ code: "conversation_forbidden" });
    expect(state.userMessages).toEqual([]);
    expect(state.runningTurns.size).toBe(0);
  });

  it("atomically persists one message and rejects a competing turn", async () => {
    const state = seededState();

    await state.beginTurn(beginInput());
    await expect(state.beginTurn(beginInput())).rejects.toMatchObject({
      code: "conversation_busy",
    });

    expect(state.userMessages).toEqual([USER_MESSAGE]);
    expect(state.runningTurns).toEqual(new Set(["conversation-1"]));
  });

  it("hides a run from a mismatched owner on run-only access", async () => {
    const state = seededState();
    const turn = await state.beginTurn(beginInput());
    await state.bindRun(turn, "run-1");

    await expect(state.assertAccessible(AUTH, "run-1")).resolves.toBeUndefined();
    await expect(
      state.assertAccessible({ ...AUTH, subjectId: "another-subject" }, "run-1"),
    ).rejects.toMatchObject({ code: "turn_run_not_found" });
    await expect(state.assertAccessible(AUTH, "unknown-run")).rejects.toMatchObject({
      code: "turn_run_not_found",
    });
  });

  it("lists only bound running turns owned by the authenticated subject", async () => {
    const state = seededState();
    const turn = await state.beginTurn(beginInput());

    await expect(state.listActiveTurns(AUTH)).resolves.toEqual([]);
    await state.bindRun(turn, "run-1");
    await expect(state.listActiveTurns(AUTH)).resolves.toEqual([
      {
        conversationId: "conversation-1",
        turnId: turn.turnId,
        runId: "run-1",
        status: "running",
      },
    ]);
    await expect(state.listActiveTurns({ ...AUTH, subjectId: "another-subject" })).resolves.toEqual(
      [],
    );
  });

  it("titles only the persisted initial exchange and keeps the first title", async () => {
    const state = seededState();
    await state.beginTurn(beginInput());

    await expect(
      state.readTitleEligibility(AUTH, "conversation-1", USER_MESSAGE.id),
    ).resolves.toEqual({ eligible: true });
    await state.prepareConversationTitle(AUTH, "conversation-1", "Initial prepared title");
    await state.prepareConversationTitle(AUTH, "conversation-1", "Ignored replacement title");

    await expect(state.listConversations(AUTH)).resolves.toContainEqual(
      expect.objectContaining({ title: "Initial prepared title" }),
    );
    await expect(
      state.readTitleEligibility(AUTH, "conversation-1", USER_MESSAGE.id),
    ).resolves.toEqual({ eligible: false, existingTitle: "Initial prepared title" });
  });
});

function seededState(): InMemoryTurnState {
  return new InMemoryTurnState([
    {
      conversationId: "conversation-1",
      workspaceId: AUTH.workspaceId,
      subjectId: AUTH.subjectId,
    },
  ]);
}

function beginInput() {
  return {
    auth: AUTH,
    conversationId: "conversation-1",
    requestId: "request-1",
    userMessage: USER_MESSAGE,
  } as const;
}
