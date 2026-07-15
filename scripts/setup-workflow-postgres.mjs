import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { applyWorkflowIntegrationGrants } from "./lib/apply-workflow-integration-grants.mjs";

const repoRoot = resolve(import.meta.dirname, "..");

try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // The connection may be supplied by the deployment environment.
}

const connectionString =
  process.env["WORKFLOW_POSTGRES_URL"] ?? process.env["SIDECHAT_DATABASE_URL"];
if (!connectionString) {
  console.error("WORKFLOW_POSTGRES_URL is required to set up the Workflow Postgres world.");
  process.exit(1);
}

await spawnNode(["node_modules/@workflow/world-postgres/bin/setup.js"], {
  WORKFLOW_POSTGRES_URL: connectionString,
});
await applyWorkflowIntegrationGrants(connectionString);
console.log("Bootstrapped the Workflow Postgres schema and Side Chat runtime grant.");

function spawnNode(args, extraEnv) {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: { ...process.env, ...extraEnv },
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolveProcess();
      else reject(new Error(`Workflow Postgres setup exited with ${code ?? "unknown"}.`));
    });
  });
}
