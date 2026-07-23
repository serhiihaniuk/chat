import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbDir = resolve(repoRoot, "packages/db");

// Pre-alpha migration policy: regenerate one fresh baseline from schema.ts
// instead of accumulating an incremental journal before compatibility is promised.
await rm(resolve(dbDir, "migrations"), { recursive: true, force: true });

const isWindows = process.platform === "win32";
const command = isWindows ? "cmd.exe" : "npx";
const generateArgs = ["--no-install", "drizzle-kit", "generate", "--name", "day_one"];
const args = isWindows ? ["/d", "/s", "/c", "npx", ...generateArgs] : generateArgs;

const result = spawnSync(command, args, { cwd: dbDir, stdio: "inherit" });
process.exit(result.status ?? 1);
