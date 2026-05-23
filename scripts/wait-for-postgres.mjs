import { spawnSync } from "node:child_process";

const composeFile = "infra/local/docker-compose.yml";
const service = "postgres";
const timeoutMs = Number(process.env["SIDECHAT_POSTGRES_WAIT_MS"] ?? 60_000);
const startedAt = Date.now();

while (Date.now() - startedAt < timeoutMs) {
  const result = spawnSync(
    "docker",
    ["compose", "-f", composeFile, "ps", "--format", "json", service],
    { encoding: "utf8" },
  );
  if (result.status === 0 && result.stdout.includes('"Health":"healthy"')) {
    process.exit(0);
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
}

console.error(`Timed out waiting for ${service} to become healthy.`);
process.exit(1);
