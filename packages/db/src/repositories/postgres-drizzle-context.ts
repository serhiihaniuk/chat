import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { sidechatTables } from "../drizzle/schema.js";
import type { createIdGenerator } from "./repository-utils.js";

export type PostgresDrizzleRepositoryContext = {
  readonly db: NodePgDatabase<typeof sidechatTables>;
  readonly ids: ReturnType<typeof createIdGenerator>;
};
