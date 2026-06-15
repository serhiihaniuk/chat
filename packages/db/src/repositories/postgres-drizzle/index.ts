import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { sidechatTables } from "#drizzle/schema";
import { REPOSITORY_ADAPTER_KINDS, type SidechatRepositories } from "../contract.js";
import { createPostgresDrizzleConversationRepository } from "./records/conversations.js";
import { createPostgresDrizzleInteractionRepository } from "./records/interactions.js";
import { createPostgresDrizzleTurnRepository } from "./records/turns.js";
import { createRandomIdGenerator } from "../repository-utils.js";

export type PostgresDrizzleRepositoryOptions = {
  readonly connectionString: string;
};

export type PostgresDrizzleSidechatRepositories = SidechatRepositories & {
  readonly adapterKind: typeof REPOSITORY_ADAPTER_KINDS.POSTGRES_DRIZZLE;
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
    adapterKind: REPOSITORY_ADAPTER_KINDS.POSTGRES_DRIZZLE,
    db: context.db,
    close: () => pool.end(),
    ...createPostgresDrizzleConversationRepository(context),
    ...createPostgresDrizzleTurnRepository(context),
    ...createPostgresDrizzleInteractionRepository(context),
  };
};
