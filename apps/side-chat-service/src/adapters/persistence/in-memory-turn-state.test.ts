import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { TURN_MESSAGE_ROLES, TURN_TERMINAL_STATUSES } from "#domain/turn/turn";

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
    await expect(
      state.beginTurn({
        ...beginInput(),
        requestId: "request-2",
        userMessage: { ...USER_MESSAGE, id: "user-2" },
      }),
    ).rejects.toMatchObject({ code: "conversation_busy" });

    expect(state.userMessages).toEqual([USER_MESSAGE]);
    expect(state.runningTurns).toEqual(new Set(["conversation-1"]));
  });

  it("returns the canonical turn for an exact request replay", async () => {
    const state = seededState();

    const first = await state.beginTurn(beginInput());
    const replay = await state.beginTurn(beginInput());

    expect(replay).toMatchObject({ turnId: first.turnId, disposition: "reused" });
    expect(state.userMessages).toEqual([USER_MESSAGE]);
  });

  it("hides a run from a mismatched owner on run-only access", async () => {
    const state = seededState();
    const turn = await state.beginTurn(beginInput());
    await state.bindRun(turn, "run-1");

    await expect(state.assertAccessible(AUTH, "run-1")).resolves.toEqual({
      turnId: "turn-1",
    });
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

  it("publishes running activity only after the resumable run id is bound", async () => {
    const state = seededState();
    const reader = state.turnActivityNotifications.openNotifications().getReader();
    const firstActivity = reader.read();
    let observedBeforeBind = false;
    void firstActivity.then(() => {
      observedBeforeBind = true;
    });

    const turn = await state.beginTurn(beginInput());
    await Promise.resolve();
    expect(observedBeforeBind).toBe(false);

    await state.bindRun(turn, "run-1");
    const notification = await firstActivity;
    expect(notification.value).toMatchObject({
      assistantTurnId: turn.turnId,
    });
    await reader.cancel();
  });

  it("commits assistant output and terminal state as one idempotent finalization", async () => {
    const state = seededState();
    const turn = await state.beginTurn(beginInput());
    await state.bindRun(turn, "run-1");
    const assistantMessage: UIMessage = {
      id: "assistant-1",
      role: TURN_MESSAGE_ROLES.ASSISTANT,
      parts: [{ type: "text", text: "Complete answer" }],
    };
    const record = {
      terminal: {
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
      assistantMessage,
    };

    await expect(state.finalize(turn, record)).resolves.toBe(true);
    await expect(state.finalize(turn, record)).resolves.toBe(false);

    await expect(state.readHistory(AUTH, "conversation-1")).resolves.toMatchObject({
      messages: [
        { id: "user-1", role: "user" },
        { id: "assistant-1", role: "assistant" },
      ],
    });
    expect(state.terminals.get(turn.turnId)).toEqual(record.terminal);
    expect(state.runningTurns.has("conversation-1")).toBe(false);
  });

  it("keeps an untitled conversation eligible and preserves the first title", async () => {
    const state = seededState();
    await state.beginTurn(beginInput());

    await expect(state.readTitleEligibility(AUTH, "conversation-1")).resolves.toEqual({
      eligible: true,
    });
    await state.prepareConversationTitle(AUTH, "conversation-1", "Initial prepared title");
    await state.prepareConversationTitle(AUTH, "conversation-1", "Ignored replacement title");

    await expect(state.listConversations(AUTH)).resolves.toContainEqual(
      expect.objectContaining({ title: "Initial prepared title" }),
    );
    await expect(state.readTitleEligibility(AUTH, "conversation-1")).resolves.toEqual({
      eligible: false,
      existingTitle: "Initial prepared title",
    });
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
