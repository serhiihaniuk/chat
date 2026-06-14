import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { sidechatTables } from "#drizzle/schema";
import type { SidechatRepositories } from "../contract.js";
import { createPostgresDrizzleConversationRepository } from "./records/conversations.js";
import { createPostgresDrizzleInteractionRepository } from "./records/interactions.js";
import { createPostgresDrizzleTurnRepository } from "./records/turns.js";
import { createRandomIdGenerator } from "../repository-utils.js";

export type PostgresDrizzleRepositoryOptions = {
  readonly connectionString: string;
};

export type PostgresDrizzleSidechatRepositories = SidechatRepositories & {
  readonly kind: "postgres-drizzle";
  readonly db: NodePgDatabase<typeof sidechatTables>;
  readonly close: () => Promise<void>;
};

export const createPostgresDrizzleSidechatRepositories = (
  options: PostgresDrizzleRepositoryOptions,
): PostgresDrizzleSidechatRepositories => {
  const pool = new Pool({ connectionString: options.connectionString });
  const context = {
    db: drizzle(pool, { schema: sidechatTables }),
    ids: createRandomIdGenerator("pg"),
  };

  return {
    kind: "postgres-drizzle",
    db: context.db,
    close: () => pool.end(),
    ...createPostgresDrizzleConversationRepository(context),
    ...createPostgresDrizzleTurnRepository(context),
    ...createPostgresDrizzleInteractionRepository(context),
  };
};
