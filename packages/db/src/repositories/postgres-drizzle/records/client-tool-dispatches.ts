import type { JsonObject } from "@side-chat/shared";
import { and, eq } from "drizzle-orm";

import { clientToolDispatches } from "#drizzle/schema";
import type { SidechatRepositories } from "../../contract.js";
import { DB_REPOSITORY_ERROR_CODES, DbRepositoryError } from "../../errors.js";
import { one, result } from "../../repository-utils.js";
import type { PostgresDrizzleRepositoryContext } from "./context.js";
import { toClientToolDispatchRecord } from "./records.js";

type ClientToolDispatchRepository = Pick<
  SidechatRepositories,
  | "claimClientToolAbort"
  | "claimClientToolTimeout"
  | "createClientToolDispatch"
  | "findClientToolDispatch"
  | "submitClientToolOutput"
>;

/** Durable coordination for browser-executed tools. */
export const createPostgresDrizzleClientToolDispatchRepository = ({
  db,
  ids,
}: PostgresDrizzleRepositoryContext): ClientToolDispatchRepository => ({
  createClientToolDispatch: async (command) => {
    const inserted = await db
      .insert(clientToolDispatches)
      .values({
        clientToolDispatchId: ids.next("client_tool_dispatch"),
        assistantTurnId: command.assistantTurnId,
        workspaceId: command.workspaceId,
        toolCallId: command.toolCallId,
        toolName: command.toolName,
        clientToolCapabilityDigest: command.clientToolCapabilityDigest,
        state: "dispatched",
        dispatchedAt: command.now,
      })
      .onConflictDoNothing({
        target: [clientToolDispatches.assistantTurnId, clientToolDispatches.toolCallId],
      })
      .returning();
    if (inserted[0]) return result(toClientToolDispatchRecord(inserted[0]), true);

    const existing = await selectClientToolDispatch(db, command);
    const record = one(
      existing,
      DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
      "Client-tool dispatch conflict did not return the existing row.",
    );
    if (
      record.toolName !== command.toolName ||
      record.clientToolCapabilityDigest !== command.clientToolCapabilityDigest
    ) {
      throw new DbRepositoryError(
        DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION,
        "A replayed client-tool call cannot change its tool or originating-tab authority.",
      );
    }
    return result(record, false);
  },
  findClientToolDispatch: async (command) => {
    const rows = await selectClientToolDispatch(db, command);
    return rows[0];
  },
  // The guarded updates are the exactly-once boundary. A result can replace
  // only `dispatched`; if timeout won first, the late arrival records timing but
  // preserves the typed timeout output that the model already received.
  submitClientToolOutput: async (command) =>
    db.transaction(async (transaction) => {
      const accepted = await transaction
        .update(clientToolDispatches)
        .set({
          state: command.state,
          outputJson: command.outputJson,
          completedAt: command.now,
        })
        .where(clientToolIdentity(command, eq(clientToolDispatches.state, "dispatched")))
        .returning();
      if (accepted[0]) {
        return {
          record: toSubmittedClientToolDispatchRecord(toClientToolDispatchRecord(accepted[0])),
          disposition: "accepted" as const,
        };
      }

      const late = await transaction
        .update(clientToolDispatches)
        .set({ state: "late", lateResultAt: command.now })
        .where(clientToolIdentity(command, eq(clientToolDispatches.state, "timed_out")))
        .returning();
      if (late[0]) {
        return {
          record: toSubmittedClientToolDispatchRecord(toClientToolDispatchRecord(late[0])),
          disposition: "late" as const,
        };
      }

      const current = await selectClientToolDispatch(transaction, command);
      return current[0]
        ? {
            record: toSubmittedClientToolDispatchRecord(current[0]),
            disposition: "duplicate" as const,
          }
        : undefined;
    }),
  claimClientToolTimeout: (command) =>
    claimClientToolDispatch(db, command, "timed_out", command.outputJson),
  claimClientToolAbort: (command) =>
    claimClientToolDispatch(db, command, "aborted", command.outputJson),
});

type ClientToolDb = PostgresDrizzleRepositoryContext["db"];

type ClientToolIdentity = {
  readonly workspaceId: string;
  readonly assistantTurnId: string;
  readonly toolCallId: string;
};

const clientToolIdentity = (command: ClientToolIdentity, state?: ReturnType<typeof eq>) =>
  and(
    eq(clientToolDispatches.workspaceId, command.workspaceId),
    eq(clientToolDispatches.assistantTurnId, command.assistantTurnId),
    eq(clientToolDispatches.toolCallId, command.toolCallId),
    state,
  );

const selectClientToolDispatch = async (db: ClientToolDb, command: ClientToolIdentity) => {
  const rows = await db
    .select()
    .from(clientToolDispatches)
    .where(clientToolIdentity(command))
    .limit(1);
  return rows.map(toClientToolDispatchRecord);
};

const claimClientToolDispatch = async (
  db: ClientToolDb,
  command: ClientToolIdentity & { readonly now: string },
  state: "timed_out" | "aborted",
  outputJson: JsonObject | undefined,
) => {
  // Timeout, cancellation, and a browser result race on the same `dispatched`
  // predicate. PostgreSQL row locking re-checks that predicate after a waiter
  // wakes, so exactly one contender can publish the model outcome.
  const claimed = await db
    .update(clientToolDispatches)
    .set({ state, outputJson, completedAt: command.now })
    .where(clientToolIdentity(command, eq(clientToolDispatches.state, "dispatched")))
    .returning();
  if (claimed[0]) return { record: toClientToolDispatchRecord(claimed[0]), claimed: true };

  const current = await selectClientToolDispatch(db, command);
  return current[0] ? { record: current[0], claimed: false } : undefined;
};

const toSubmittedClientToolDispatchRecord = (
  record: ReturnType<typeof toClientToolDispatchRecord>,
) => {
  if (
    record.outputJson === undefined ||
    record.state === "dispatched" ||
    record.state === "timed_out"
  ) {
    throw new DbRepositoryError(
      DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION,
      "A submitted client-tool result must resolve to a stored terminal model output.",
    );
  }
  return { ...record, state: record.state, outputJson: record.outputJson };
};
