import { createPostgresDrizzleSidechatRepositories } from "@side-chat/db";
import type { UIMessage } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TURN_REJECTION_CODES } from "#application/turn/turn-errors";
import type { AuthContext } from "@side-chat/side-chat-server";
import {
  TURN_MESSAGE_ROLES,
  TURN_TERMINAL_STATUSES,
  ZERO_TURN_USAGE,
  type TurnMessage,
} from "#domain/turn/turn";
import type { ChatTurnFinalization } from "#workflows/outcome/chat-turn-outcome";
import { runChatTurnFinalizeStep } from "#workflows/production/chat-turn-finalize";

import { createPostgresTurnState, type PostgresTurnState } from "./postgres-turn-state.js";

// Gated exactly like the db-package container tests: this only runs when a
// migrated Postgres is provided via SIDECHAT_TEST_DATABASE_URL (the db container
// harness applies the schema). A plain `vitest run` skips it.
const databaseUrl = process.env["SIDECHAT_TEST_DATABASE_URL"];

describe.skipIf(!databaseUrl)("postgres turn state adapter (integration)", () => {
  let state: PostgresTurnState;
  let reader: ReturnType<typeof createPostgresDrizzleSidechatRepositories>;

  beforeAll(() => {
    // Narrowed by the guard; the suite is skipped when the url is absent.
    if (!databaseUrl) throw new Error("SIDECHAT_TEST_DATABASE_URL is required.");
    state = createPostgresTurnState(databaseUrl);
    reader = createPostgresDrizzleSidechatRepositories({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    await state.close();
    await reader.close();
  });

  let scopeCounter = 0;
  const nextScope = () => `svc_pg_${Date.now()}_${++scopeCounter}`;
  const authFor = (scope: string): AuthContext => ({
    workspaceId: `ws_${scope}`,
    subjectId: `subject_${scope}`,
    issuedAt: "2026-05-23T13:00:00.000Z",
  });
  const userMessage = (scope: string): TurnMessage => ({
    id: `${scope}_user`,
    role: TURN_MESSAGE_ROLES.USER,
    text: "Hello",
  });

  it("runs the full begin -> bindRun -> atomic finalize round-trip", async () => {
    const scope = nextScope();
    const auth = authFor(scope);
    const conversationId = `${scope}_conversation`;
    const runId = `${scope}_run`;

    const turn = await state.beginTurn({
      auth,
      conversationId,
      requestId: `${scope}_req`,
      userMessage: userMessage(scope),
    });
    expect(turn.conversationId).toBe(conversationId);

    await expect(state.assertOwned(auth, conversationId)).resolves.toBeUndefined();
    // A running turn makes the conversation busy to any new begin.
    await expect(
      state.assertCanBegin(auth, conversationId, `${scope}_next_req`),
    ).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.BUSY,
    });

    await state.bindRun(turn, runId);
    await expect(state.assertRunOwned(auth, conversationId, runId)).resolves.toBeUndefined();

    const claimed = await state.finalize(turn, {
      terminal: {
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
        finishReason: "stop",
      },
      assistantMessage: {
        id: `${scope}_assistant`,
        role: TURN_MESSAGE_ROLES.ASSISTANT,
        parts: [{ type: "text", text: "Hi there" }],
      },
    });
    expect(claimed).toBe(true);

    // The durable record carries the bound run, terminal status, and folded usage.
    const record = await reader.findAssistantTurn({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      assistantTurnId: turn.turnId,
    });
    expect(record).toMatchObject({ status: "completed", runId, totalTokens: 8 });

    const history = await reader.readConversationHistory({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      conversationId,
      limit: 10,
    });
    expect(history.map((message) => message.role)).toEqual(["user", "assistant"]);

    // Once terminal, the conversation admits a new turn again.
    await expect(state.assertCanBegin(auth, conversationId, `${scope}_next_req`)).resolves.toBe(
      "created",
    );
  });

  it("rejects a second concurrent begin on the same conversation as BUSY", async () => {
    const scope = nextScope();
    const auth = authFor(scope);
    const conversationId = `${scope}_conversation`;

    await state.beginTurn({
      auth,
      conversationId,
      requestId: `${scope}_req1`,
      userMessage: userMessage(scope),
    });

    await expect(
      state.beginTurn({
        auth,
        conversationId,
        requestId: `${scope}_req2`,
        userMessage: { id: `${scope}_user2`, role: TURN_MESSAGE_ROLES.USER, text: "second" },
      }),
    ).rejects.toMatchObject({ code: TURN_REJECTION_CODES.BUSY });
  });

  it("maps a cross-subject conversation id collision to FORBIDDEN", async () => {
    const scope = nextScope();
    const owner = authFor(scope);
    const conversationId = `${scope}_conversation`;

    await state.beginTurn({
      auth: owner,
      conversationId,
      requestId: `${scope}_req`,
      userMessage: userMessage(scope),
    });

    const intruder: AuthContext = {
      workspaceId: owner.workspaceId,
      subjectId: `subject_${scope}_other`,
      issuedAt: owner.issuedAt,
    };
    await expect(
      state.beginTurn({
        auth: intruder,
        conversationId,
        requestId: `${scope}_intruder`,
        userMessage: {
          id: `${scope}_intruder_user`,
          role: TURN_MESSAGE_ROLES.USER,
          text: "intrude",
        },
      }),
    ).rejects.toMatchObject({ code: TURN_REJECTION_CODES.FORBIDDEN });
  });

  it("replays begin and aggregate finalization idempotently", async () => {
    const scope = nextScope();
    const auth = authFor(scope);
    const conversationId = `${scope}_conversation`;
    const requestId = `${scope}_req`;
    const user = userMessage(scope);

    const first = await state.beginTurn({ auth, conversationId, requestId, userMessage: user });
    // Same request id + conversation replays to the same turn, not a BUSY conflict.
    const replay = await state.beginTurn({ auth, conversationId, requestId, userMessage: user });
    expect(replay.turnId).toBe(first.turnId);

    const assistant: UIMessage = {
      id: `${scope}_assistant`,
      role: TURN_MESSAGE_ROLES.ASSISTANT,
      parts: [{ type: "text", text: "once" }],
    };
    const claimedFirst = await state.finalize(first, {
      terminal: {
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: "stop",
      },
      assistantMessage: assistant,
    });
    const claimedReplay = await state.finalize(first, {
      terminal: {
        status: TURN_TERMINAL_STATUSES.FAILED,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      },
      assistantMessage: assistant,
    });
    expect(claimedFirst).toBe(true);
    expect(claimedReplay).toBe(false);

    const history = await reader.readConversationHistory({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      conversationId,
      limit: 10,
    });
    // The double append persisted exactly one assistant message.
    expect(history.filter((message) => message.role === "assistant")).toHaveLength(1);

    const record = await reader.findAssistantTurn({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      assistantTurnId: first.turnId,
    });
    // The replayed failed claim did not overwrite the completed terminal.
    expect(record?.status).toBe("completed");
  });

  it("rejects an unknown or cross-subject run id via assertRunOwned", async () => {
    const scope = nextScope();
    const auth = authFor(scope);
    const conversationId = `${scope}_conversation`;
    const runId = `${scope}_run`;

    const turn = await state.beginTurn({
      auth,
      conversationId,
      requestId: `${scope}_req`,
      userMessage: userMessage(scope),
    });
    await state.bindRun(turn, runId);

    await expect(
      state.assertRunOwned(auth, conversationId, `${scope}_unknown`),
    ).rejects.toMatchObject({ code: TURN_REJECTION_CODES.RUN_NOT_FOUND });

    const other: AuthContext = { ...auth, subjectId: `subject_${scope}_other` };
    await expect(state.assertRunOwned(other, conversationId, runId)).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.RUN_NOT_FOUND,
    });
    await expect(state.assertAccessible(auth, runId)).resolves.toEqual({ turnId: turn.turnId });
    await expect(state.assertAccessible(other, runId)).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.RUN_NOT_FOUND,
    });
  });

  it("rejects a turn for an unknown conversation via assertOwned", async () => {
    const scope = nextScope();
    await expect(state.assertOwned(authFor(scope), `${scope}_missing`)).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.NOT_FOUND,
    });
  });

  // The workflow-side finalize step is the durable-finalize proof: it runs in a
  // FRESH adapter (no in-memory identity map) and must recover ownership from the
  // widened turn ref alone, exactly as it does after a route crash or worker kill.
  it("durably finalizes a completed turn from a fresh adapter and replays idempotently", async () => {
    const scope = nextScope();
    const auth = authFor(scope);
    const conversationId = `${scope}_conversation`;

    const turn = await state.beginTurn({
      auth,
      conversationId,
      requestId: `${scope}_req`,
      userMessage: userMessage(scope),
    });
    await state.bindRun(turn, `${scope}_run`);

    const assistantMessage: UIMessage = {
      id: `${scope}_assistant`,
      role: TURN_MESSAGE_ROLES.ASSISTANT,
      parts: [{ type: "text", text: "Persisted by the workflow" }],
    };
    const finalization: ChatTurnFinalization = {
      terminal: {
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
        finishReason: "stop",
      },
      assistantMessage,
    };

    await runChatTurnFinalizeStep({
      databaseUrl: requireDatabaseUrl(),
      identity: turn,
      finalization,
    });

    const record = await reader.findAssistantTurn({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      assistantTurnId: turn.turnId,
    });
    expect(record).toMatchObject({ status: "completed", totalTokens: 5 });
    const history = await reader.readConversationHistory({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      conversationId,
      limit: 10,
    });
    expect(history.map((message) => message.role)).toEqual(["user", "assistant"]);

    // A durable REPLAY re-runs the step: the guarded CAS loses, so the terminal
    // is untouched and no duplicate assistant message is appended.
    await runChatTurnFinalizeStep({
      databaseUrl: requireDatabaseUrl(),
      identity: turn,
      finalization: {
        terminal: {
          status: TURN_TERMINAL_STATUSES.FAILED,
          usage: ZERO_TURN_USAGE,
        },
      },
    });

    const replayed = await reader.findAssistantTurn({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      assistantTurnId: turn.turnId,
    });
    expect(replayed?.status).toBe("completed");
    const historyAfterReplay = await reader.readConversationHistory({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      conversationId,
      limit: 10,
    });
    expect(historyAfterReplay.filter((message) => message.role === "assistant")).toHaveLength(1);
  });

  it.each([TURN_TERMINAL_STATUSES.BLOCKED, TURN_TERMINAL_STATUSES.CANCELLED])(
    "finalizes a %s turn without persisting an assistant message",
    async (status) => {
      const scope = nextScope();
      const auth = authFor(scope);
      const conversationId = `${scope}_conversation`;

      const turn = await state.beginTurn({
        auth,
        conversationId,
        requestId: `${scope}_req`,
        userMessage: userMessage(scope),
      });

      await runChatTurnFinalizeStep({
        databaseUrl: requireDatabaseUrl(),
        identity: turn,
        finalization: { terminal: { status, usage: ZERO_TURN_USAGE } },
      });

      const record = await reader.findAssistantTurn({
        workspaceId: auth.workspaceId,
        subjectId: auth.subjectId,
        assistantTurnId: turn.turnId,
      });
      expect(record?.status).toBe(status);
      const history = await reader.readConversationHistory({
        workspaceId: auth.workspaceId,
        subjectId: auth.subjectId,
        conversationId,
        limit: 10,
      });
      expect(history.map((message) => message.role)).toEqual(["user"]);
    },
  );
});

function requireDatabaseUrl(): string {
  if (!databaseUrl) throw new Error("SIDECHAT_TEST_DATABASE_URL is required.");
  return databaseUrl;
}
