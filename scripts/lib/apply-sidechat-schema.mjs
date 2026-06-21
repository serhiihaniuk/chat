import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = resolve(repoRoot, "packages/db/migrations");
const grantsPath = resolve(repoRoot, "packages/db/sql/runtime-role-grants.sql");

const orderedMigrationFiles = async () => {
  const journal = JSON.parse(await readFile(resolve(migrationsDir, "meta/_journal.json"), "utf8"));
  return [...journal.entries]
    .sort((left, right) => left.idx - right.idx)
    .map((entry) => resolve(migrationsDir, `${entry.tag}.sql`));
};

/**
 * Rebuild the sidechat schema from a clean state.
 *
 * Drops the schema, recreates it (the generated migration assumes it exists),
 * applies every generated migration in journal order, then applies the durable
 * role/grants policy that drizzle-kit does not manage.
 */
export const applySidechatSchema = async (connectionString) => {
  const pool = new Pool({ connectionString });
  try {
    await pool.query("DROP SCHEMA IF EXISTS sidechat CASCADE");
    await pool.query('CREATE SCHEMA "sidechat"');
    for (const file of await orderedMigrationFiles()) {
      await pool.query(await readFile(file, "utf8"));
    }
    await pool.query(await readFile(grantsPath, "utf8"));
  } finally {
    await pool.end();
  }
};
