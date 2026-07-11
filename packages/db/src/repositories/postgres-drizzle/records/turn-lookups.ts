import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { assistantTurns, type sidechatTables } from "#drizzle/schema";
import type { SidechatRepositories } from "../../contract.js";
import { toAssistantTurnRecord } from "./records.js";

type TurnLookupDb = NodePgDatabase<typeof sidechatTables>;

/**
 * Read one turn by id, scoped to workspace + subject.
 *
 * Returns `undefined` for an unknown, cross-workspace, or cross-subject id so the
 * route maps a guessed or leaked id to a not-found response instead of leaking
 * another user's turn.
 */
export const findAssistantTurn =
  (db: TurnLookupDb): SidechatRepositories["findAssistantTurn"] =>
  async (command) => {
    const rows = await db
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, command.workspaceId),
          eq(assistantTurns.subjectId, command.subjectId),
          eq(assistantTurns.assistantTurnId, command.assistantTurnId),
        ),
      )
      .limit(1);
    return rows[0] ? toAssistantTurnRecord(rows[0]) : undefined;
  };

/** Resolve one turn from a client request id, scoped to the workspace. */
export const findAssistantTurnByRequest =
  (db: TurnLookupDb): SidechatRepositories["findAssistantTurnByRequest"] =>
  async (command) => {
    const rows = await db
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, command.workspaceId),
          eq(assistantTurns.requestId, command.requestId),
        ),
      )
      .limit(1);
    return rows[0] ? toAssistantTurnRecord(rows[0]) : undefined;
  };

/**
 * Read the running turn for one conversation, if any.
 *
 * The most recently started running turn is the one a reconnect recovers; a
 * conversation should only ever have one, but ordering keeps this stable.
 */
export const findActiveAssistantTurn =
  (db: TurnLookupDb): SidechatRepositories["findActiveAssistantTurn"] =>
  async (command) => {
    const rows = await db
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, command.workspaceId),
          eq(assistantTurns.subjectId, command.subjectId),
          eq(assistantTurns.conversationId, command.conversationId),
          eq(assistantTurns.status, "running"),
        ),
      )
      .orderBy(desc(assistantTurns.startedAt))
      .limit(1);
    return rows[0] ? toAssistantTurnRecord(rows[0]) : undefined;
  };

/**
 * Resolve one turn from the durable run id it is bound to.
 *
 * Scoped to workspace + subject so both run-only replay and conversation-bound
 * cancellation can use one non-enumerating lookup. Cancellation separately
 * compares the returned conversation id. Returns `undefined` for an unknown,
 * cross-workspace, or cross-subject run id rather than leaking its existence.
 */
export const findAssistantTurnByRun =
  (db: TurnLookupDb): SidechatRepositories["findAssistantTurnByRun"] =>
  async (command) => {
    const rows = await db
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, command.workspaceId),
          eq(assistantTurns.subjectId, command.subjectId),
          eq(assistantTurns.runId, command.runId),
        ),
      )
      .limit(1);
    return rows[0] ? toAssistantTurnRecord(rows[0]) : undefined;
  };

/**
 * Read every running turn for a subject, across all conversations.
 *
 * Powers the activity stream's snapshot on connect: one entry per conversation
 * with an in-flight turn. Ordered by start time so the snapshot is stable from
 * read to read.
 */
export const listActiveAssistantTurns =
  (db: TurnLookupDb): SidechatRepositories["listActiveAssistantTurns"] =>
  async (command) => {
    const rows = await db
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, command.workspaceId),
          eq(assistantTurns.subjectId, command.subjectId),
          eq(assistantTurns.status, "running"),
        ),
      )
      .orderBy(desc(assistantTurns.startedAt));
    return rows.map(toAssistantTurnRecord);
  };
