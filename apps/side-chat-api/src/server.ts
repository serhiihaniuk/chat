import { serve } from "@hono/node-server";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Runtime entry point. It loads a nearby .env for local demos, then imports the
 * Hono app after environment variables are available to the composition root.
 */
const parseDotEnvLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;

  const normalized = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed;
  const separatorIndex = normalized.indexOf("=");
  if (separatorIndex <= 0) return;

  const key = normalized.slice(0, separatorIndex).trim();
  const rawValue = normalized.slice(separatorIndex + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key]) return;

  const quote = rawValue[0];
  const value =
    (quote === '"' || quote === "'") && rawValue.endsWith(quote)
      ? rawValue.slice(1, -1)
      : rawValue;
  process.env[key] = value.replace(/\\n/g, "\n");
};

const findDotEnvPath = () => {
  let current = dirname(fileURLToPath(import.meta.url));
  const { root } = parse(current);

  while (current !== root) {
    const candidate = join(current, ".env");
    if (existsSync(candidate)) return candidate;
    current = dirname(current);
  }

  const rootCandidate = join(root, ".env");
  return existsSync(rootCandidate) ? rootCandidate : undefined;
};

const loadDotEnv = () => {
  const envPath = findDotEnvPath();
  if (!envPath) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    parseDotEnvLine(line);
  }
};

loadDotEnv();

const { default: app } = await import("./index.js");

const port = Number(process.env.PORT ?? 3000);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`side-chat-api listening on http://localhost:${info.port}`);
  },
);
