import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbDir = resolve(repoRoot, "packages/db");

// Prototype convention: exactly one fresh migration. Regenerate from schema.ts
// on every schema change instead of accumulating an incremental journal chain.
await rm(resolve(dbDir, "migrations"), { recursive: true, force: true });

const isWindows = process.platform === "win32";
const command = isWindows ? "cmd.exe" : "npx";
const generateArgs = ["--no-install", "drizzle-kit", "generate", "--name", "day_one"];
const args = isWindows ? ["/d", "/s", "/c", "npx", ...generateArgs] : generateArgs;

const result = spawnSync(command, args, { cwd: dbDir, stdio: "inherit" });
process.exit(result.status ?? 1);
