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
    await spawnNpm(["run", "test:db:integration"], {
      SIDECHAT_TEST_DATABASE_URL: postgres.connectionString,
    });
  } finally {
    await postgres.stop();
  }
};

const spawnNpm = (args, extraEnv) =>
  new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "cmd.exe" : "npm";
    const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      env: cleanEnv({ ...process.env, ...extraEnv }),
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args.join(" ")} exited with ${code ?? "unknown"}`));
    });
  });

const cleanEnv = (env) =>
  Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) => key.length > 0 && !key.startsWith("=") && value !== undefined,
    ),
  );

await run();
