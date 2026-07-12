import { omitUndefinedProperties, type DiagnosticLogger } from "@side-chat/shared";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import { sidechatTables } from "#drizzle/schema";
import { REPOSITORY_ADAPTER_KINDS, type SidechatRepositories } from "../contract.js";
import { createPostgresDrizzleConversationRepository } from "./records/conversations.js";
import { createPostgresDrizzleClientToolDispatchRepository } from "./records/client-tool-dispatches.js";
import { createPostgresDrizzleToolApprovalRepository } from "./records/approvals/tool-approvals.js";
import { createPostgresDrizzleInteractionRepository } from "./records/interactions.js";
import { createPostgresDrizzleTurnRepository } from "./records/turns.js";
import { createRandomIdGenerator } from "../repository-utils.js";

export { createPostgresHostCommandResultNotificationSource } from "./notifications/host-command-result-notification-source.js";
export { uniqueViolationConstraint } from "./pg-errors.js";

/** Tunables for the shared query pool; absent fields keep node-postgres defaults. */
export type PostgresPoolOptions = {
  readonly max?: number | undefined;
  readonly idleTimeoutMillis?: number | undefined;
  readonly connectionTimeoutMillis?: number | undefined;
  readonly ssl?: boolean | undefined;
};

export type PostgresDrizzleRepositoryOptions = {
  readonly connectionString: string;
  /** Query-pool tunables surfaced from `sidechat.config.ts`. */
  readonly pool?: PostgresPoolOptions | undefined;
  /**
   * Diagnostic logger for the pool's `'error'` events. node-postgres emits
   * `'error'` on an idle client whose connection dropped; without a handler Node
   * treats it as an uncaught exception and crashes the process. Logging it keeps
   * the pool fail-open — the next query re-establishes a connection.
   */
  readonly logger?: DiagnosticLogger | undefined;
};

export type PostgresDrizzleSidechatRepositories = SidechatRepositories & {
  readonly adapterKind: typeof REPOSITORY_ADAPTER_KINDS.POSTGRES_DRIZZLE;
  readonly db: NodePgDatabase<typeof sidechatTables>;
  readonly close: () => Promise<void>;
};

const toPoolConfig = (options: PostgresDrizzleRepositoryOptions): PoolConfig =>
  omitUndefinedProperties({
    connectionString: options.connectionString,
    max: options.pool?.max,
    idleTimeoutMillis: options.pool?.idleTimeoutMillis,
    connectionTimeoutMillis: options.pool?.connectionTimeoutMillis,
    ssl: options.pool?.ssl,
  });

export const createPostgresDrizzleSidechatRepositories = (
  options: PostgresDrizzleRepositoryOptions,
): PostgresDrizzleSidechatRepositories => {
  const pool = new Pool(toPoolConfig(options));
  // A dropped idle connection surfaces here; swallowing-with-a-log keeps a
  // Postgres restart or LB idle-timeout from crashing the process.
  pool.on("error", (error) =>
    options.logger?.error("postgres pool error", { error: error.message }),
  );
  const context = {
    db: drizzle(pool, { schema: sidechatTables }),
    ids: createRandomIdGenerator("pg"),
  };

  return {
    adapterKind: REPOSITORY_ADAPTER_KINDS.POSTGRES_DRIZZLE,
    db: context.db,
    close: () => pool.end(),
    ...createPostgresDrizzleConversationRepository(context),
    ...createPostgresDrizzleClientToolDispatchRepository(context),
    ...createPostgresDrizzleToolApprovalRepository(context),
    ...createPostgresDrizzleTurnRepository(context),
    ...createPostgresDrizzleInteractionRepository(context),
  };
};
