import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import { GenericContainer, Wait } from "testcontainers";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const POSTGRES_IMAGE = "postgres:16.10-alpine";
const database = "sidechat";
const username = "sidechat";
const password = "sidechat";

export const startPostgresTestContainer = async () => {
  const container = await new GenericContainer(POSTGRES_IMAGE)
    .withEnvironment({
      POSTGRES_DB: database,
      POSTGRES_PASSWORD: password,
      POSTGRES_USER: username,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage("database system is ready to accept connections"))
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const connectionString = `postgres://${username}:${password}@${host}:${port}/${database}`;
  await waitForPostgres(connectionString);

  return {
    connectionString,
    stop: () => container.stop(),
  };
};

const waitForPostgres = async (connectionString) => {
  const deadline = Date.now() + 60_000;
  let lastError;

  while (Date.now() < deadline) {
    const pool = new Pool({ connectionString });
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  throw lastError ?? new Error("Timed out waiting for Postgres.");
};

export const applySidechatMigrations = async (connectionString) => {
  const pool = new Pool({ connectionString });
  const migrationPath = resolve(repoRoot, "packages/db/migrations/0000_side_chat_day_one.sql");

  try {
    await pool.query("DROP SCHEMA IF EXISTS sidechat CASCADE");
    await pool.query(await readFile(migrationPath, "utf8"));
  } finally {
    await pool.end();
  }
};
