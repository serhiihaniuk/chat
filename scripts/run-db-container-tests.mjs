import { spawn } from "node:child_process";
import { resolve } from "node:path";

import {
  applySidechatMigrations,
  startPostgresTestContainer,
} from "./lib/postgres-testcontainer.mjs";

const repoRoot = resolve(import.meta.dirname, "..");

const run = async () => {
  const postgres = await startPostgresTestContainer();

  try {
    await applySidechatMigrations(postgres.connectionString);
    await spawnNode(["node_modules/@workflow/world-postgres/bin/setup.js"], {
      WORKFLOW_POSTGRES_URL: postgres.connectionString,
    });
    await spawnNpm(["run", "test:db:integration"], {
      SIDECHAT_TEST_DATABASE_URL: postgres.connectionString,
      WORKFLOW_POSTGRES_URL: postgres.connectionString,
    });
  } finally {
    await postgres.stop();
  }
};

const spawnNpm = (args, extraEnv) =>
  spawnProcess(
    process.platform === "win32" ? "cmd.exe" : "npm",
    process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args,
    extraEnv,
    `npm ${args.join(" ")}`,
  );

const spawnNode = (args, extraEnv) =>
  spawnProcess(process.execPath, args, extraEnv, `node ${args.join(" ")}`);

const spawnProcess = (command, args, extraEnv, description) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: cleanEnv({ ...process.env, ...extraEnv }),
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${description} exited with ${code ?? "unknown"}`));
    });
  });

const cleanEnv = (env) =>
  Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) => key.length > 0 && !key.startsWith("=") && value !== undefined,
    ),
  );

await run();
