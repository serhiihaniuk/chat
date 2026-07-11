import { createPostgresDrizzleSidechatRepositories } from "@side-chat/db";
import type { UIMessage } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TURN_REJECTION_CODES } from "#application/turn/turn-errors";
import type { AuthContext } from "#domain/auth-context";
import { TURN_MESSAGE_ROLES, TURN_TERMINAL_STATUSES, type TurnMessage } from "#domain/turn/turn";

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

  it("runs the full begin -> bindRun -> appendAssistant -> claimTerminal round-trip", async () => {
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
    await expect(state.assertCanBegin(auth, conversationId)).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.BUSY,
    });

    await state.bindRun(turn, runId);
    await expect(state.assertRunOwned(auth, conversationId, runId)).resolves.toBeUndefined();

    await state.appendAssistantMessage(turn, {
      id: `${scope}_assistant`,
      role: TURN_MESSAGE_ROLES.ASSISTANT,
      parts: [{ type: "text", text: "Hi there" }],
    });
    const claimed = await state.claimTerminal(turn, {
      status: TURN_TERMINAL_STATUSES.COMPLETED,
      usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
      finishReason: "stop",
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
    await expect(state.assertCanBegin(auth, conversationId)).resolves.toBeUndefined();
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

  it("replays begin, appendAssistant, and claimTerminal idempotently", async () => {
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
    await state.appendAssistantMessage(first, assistant);
    await state.appendAssistantMessage(first, assistant);

    const claimedFirst = await state.claimTerminal(first, {
      status: TURN_TERMINAL_STATUSES.COMPLETED,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    });
    const claimedReplay = await state.claimTerminal(first, {
      status: TURN_TERMINAL_STATUSES.FAILED,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
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
    await expect(state.assertAccessible(auth, runId)).resolves.toBeUndefined();
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
});
