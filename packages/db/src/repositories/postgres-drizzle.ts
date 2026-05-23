import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { sidechatTables } from "../drizzle/schema.js";
import type { SidechatRepositories } from "./contract.js";
import { createPostgresDrizzleConversationRepository } from "./postgres-drizzle-conversations.js";
import { createPostgresDrizzleInteractionRepository } from "./postgres-drizzle-interactions.js";
import { createPostgresDrizzleTurnRepository } from "./postgres-drizzle-turns.js";
import { createIdGenerator } from "./repository-utils.js";

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
    ids: createIdGenerator("pg"),
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
