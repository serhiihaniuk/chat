import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { assistantTurns, type sidechatTables } from "#drizzle/schema";
import type { SidechatRepositories } from "../../contract.js";
import { toAssistantTurnRecord } from "./records.js";

type TurnLookupDb = NodePgDatabase<typeof sidechatTables>;

/**
 * Read one turn by id, scoped to the workspace.
 *
 * Returns `undefined` for an unknown or cross-workspace id so the route maps a
 * guessed id to a not-found response instead of a thrown error.
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
 * The most recently started running turn is the one a reconnect resumes; a
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
