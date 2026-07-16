import { spawn } from "node:child_process";
import { resolve } from "node:path";

import {
  applySidechatMigrations,
  startPostgresTestContainer,
} from "./lib/postgres-testcontainer.mjs";
import { applyWorkflowIntegrationGrants } from "./lib/apply-workflow-integration-grants.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const postgres = await startPostgresTestContainer();

try {
  await applySidechatMigrations(postgres.connectionString);
  await runNode(["node_modules/@workflow/world-postgres/bin/setup.js"], {
    WORKFLOW_POSTGRES_URL: postgres.connectionString,
  });
  await applyWorkflowIntegrationGrants(postgres.connectionString);
  await runNpm(
    [
      "test",
      "--",
      "--no-file-parallelism",
      "apps/side-chat-service/src/composition/lifecycle/process/service-lifecycle.integration.test.ts",
    ],
    {
      SIDECHAT_TEST_DATABASE_URL: postgres.connectionString,
      WORKFLOW_POSTGRES_URL: postgres.connectionString,
    },
  );
  await runNpm(
    [
      "test",
      "--",
      "apps/side-chat-service/src/composition/route/service-compatibility.integration.test.ts",
    ],
    {},
  );
} finally {
  await postgres.stop();
}

function runNpm(args, extraEnv) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;
  return runProcess(command, commandArgs, extraEnv, `npm ${args.join(" ")}`);
}

function runNode(args, extraEnv) {
  return runProcess(process.execPath, args, extraEnv, `node ${args.join(" ")}`);
}

function runProcess(command, args, extraEnv, description) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: cleanEnv({ ...process.env, ...extraEnv }),
      shell: false,
      stdio: "inherit",
    });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${description} exited with ${code ?? "unknown"}`));
    });
  });
}

function cleanEnv(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key, value]) => key.length > 0 && !key.startsWith("=") && value !== undefined,
    ),
  );
}
