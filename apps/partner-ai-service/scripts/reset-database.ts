import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SERVICE_ENV_KEYS, envValue } from "#config/env/service-env-contract";

import { applySidechatSchema } from "../../../scripts/lib/apply-sidechat-schema.mjs";

// `db:reset` entry point. The service is the single source of truth for the
// database connection (sidechat.config.ts -> environment.databaseUrl, resolved
// from SIDECHAT_DATABASE_URL via SERVICE_ENV_KEYS). Resolve it here and pass it
// down to the pure db apply; tooling never re-reads the env contract itself.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // .env is optional; the connection may come from the ambient environment.
}

const connectionString = envValue(process.env, SERVICE_ENV_KEYS.databaseUrl);
if (!connectionString) {
  console.error("SIDECHAT_DATABASE_URL is required to reset the database (set it in .env).");
  process.exit(1);
}

await applySidechatSchema(connectionString);
console.log("Rebuilt sidechat schema from generated migrations + role grants.");
