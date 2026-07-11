import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { applySidechatSchema } from "./lib/apply-sidechat-schema.mjs";

// `db:reset` entry point. SIDECHAT_DATABASE_URL is a plain environment variable
// (declared in the service's sidechat.config.ts, resolved from the environment at
// boot). This tooling reads it directly rather than importing the service, so a
// schema rebuild never drags application wiring into the reset path.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // .env is optional; the connection may come from the ambient environment.
}

const connectionString = process.env["SIDECHAT_DATABASE_URL"];
if (!connectionString) {
  console.error("SIDECHAT_DATABASE_URL is required to reset the database (set it in .env).");
  process.exit(1);
}

await applySidechatSchema(connectionString);
console.log("Rebuilt sidechat schema from generated migrations + role grants.");
