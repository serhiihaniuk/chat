import { sql } from "drizzle-orm";

import { TURN_ACTIVITY_NOTIFY_CHANNEL } from "#schema-contract";
import type { PostgresDrizzleRepositoryContext } from "../context.js";

type ActivityExecutor = Pick<PostgresDrizzleRepositoryContext["db"], "execute">;

type ActivityRow = Readonly<{
  workspaceId: string;
  subjectId: string;
  conversationId: string;
  assistantTurnId: string;
  status: string;
}>;

/** Publish only turn identity and lifecycle; messages and provider content never enter NOTIFY. */
export function notifyTurnActivity(executor: ActivityExecutor, row: ActivityRow): Promise<unknown> {
  const payload = JSON.stringify({
    workspaceId: row.workspaceId,
    subjectId: row.subjectId,
    conversationId: row.conversationId,
    assistantTurnId: row.assistantTurnId,
    status: row.status,
  });
  return executor.execute(sql`select pg_notify(${TURN_ACTIVITY_NOTIFY_CHANNEL}, ${payload})`);
}
