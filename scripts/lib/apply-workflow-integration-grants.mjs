import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const grantsPath = resolve(repoRoot, "packages/db/sql/workflow-integration-grants.sql");

/** Apply the product runtime's narrow read grant after Postgres World bootstrap. */
export const applyWorkflowIntegrationGrants = async (connectionString) => {
  const pool = new Pool({ connectionString });
  try {
    await pool.query(await readFile(grantsPath, "utf8"));
  } finally {
    await pool.end();
  }
};
