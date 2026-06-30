#!/usr/bin/env node
// Local dev launcher — `npm run dev`.
//
// Boots the full app for browser testing with the REAL model:
//   - backend  @side-chat/partner-ai-service  (tsx, drives sidechat.config.ts + .env)
//   - widget   @side-chat/widget-harness       (Vite), proxies /side-chat-api -> backend
//
// What it does: free both ports, load .env (for SIDECHAT_OPENAI_API_KEY and the
// rest of the config), start the backend, wait for /healthz, then start the widget
// and print its URL. Ctrl-C stops both. Ports live in scripts/dev.config.json; the
// model/provider live in apps/partner-ai-service/sidechat.config.ts. No secrets
// live in this file.
//
// Independent of scripts/run-local-fake.mjs (the work-env launcher). Node built-ins only.

import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devConfig = loadJson(path.join(ROOT, "scripts", "dev.config.json"), {
  backendPort: 8787,
  widgetPort: 5173,
});
const BACKEND_PORT = devConfig.backendPort;
const WIDGET_PORT = devConfig.widgetPort;
const WIDGET_URL = `http://127.0.0.1:${WIDGET_PORT}/`;
const BACKEND_TARGET = `http://127.0.0.1:${BACKEND_PORT}`;

const dotenv = parseEnvFile(path.join(ROOT, ".env"));
const env = {
  ...process.env,
  ...dotenv,
  // The backend reads PORT; pin it to our config so the widget proxy target matches.
  PORT: String(BACKEND_PORT),
  // sidechat.config.ts is production-intended; development keeps the permissive
  // local posture (in-memory persistence, allow_all) instead of failing closed.
  SIDECHAT_PROFILE: dotenv.SIDECHAT_PROFILE ?? process.env.SIDECHAT_PROFILE ?? "development",
};

if (!env.SIDECHAT_OPENAI_API_KEY) {
  console.error(
    "[dev] Missing SIDECHAT_OPENAI_API_KEY.\n" +
      "      Add it to a .env file at the repo root, for example:\n" +
      "        SIDECHAT_OPENAI_API_KEY=sk-...\n",
  );
  process.exit(1);
}

const children = [];
let shuttingDown = false;

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

main();

async function main() {
  console.log(`[dev] freeing ports ${BACKEND_PORT} (backend) and ${WIDGET_PORT} (widget)...`);
  freePort(BACKEND_PORT);
  freePort(WIDGET_PORT);

  console.log(`[dev] starting backend on :${BACKEND_PORT} (real model via sidechat.config.ts)...`);
  startWorkspaceDev("backend", "@side-chat/partner-ai-service", env);

  const healthy = await waitForHealth(60_000);
  if (!healthy) {
    console.error("[dev] backend did not become healthy within 60s — see the logs above.");
    shutdown(1);
    return;
  }

  console.log(`[dev] backend healthy. starting widget harness on :${WIDGET_PORT}...`);
  startWorkspaceDev(
    "widget",
    "@side-chat/widget-harness",
    { ...env, SIDECHAT_WIDGET_HARNESS_API_TARGET: BACKEND_TARGET },
    ["--strictPort"],
  );

  console.log(
    `\n  ▸ Widget:         ${WIDGET_URL}\n` +
      `  ▸ Backend health: ${BACKEND_TARGET}/healthz\n` +
      `  (Ctrl-C stops both)\n`,
  );
}

function startWorkspaceDev(label, workspace, childEnv, viteArgs = []) {
  const args = ["run", "dev", "-w", workspace, ...(viteArgs.length > 0 ? ["--", ...viteArgs] : [])];
  // Pass one command string (not an args array) so shell:true doesn't trip
  // Node's DEP0190 warning; the workspace name and flags contain no spaces.
  const child = spawn(["npm", ...args].join(" "), {
    cwd: ROOT,
    env: childEnv,
    stdio: "inherit",
    shell: true,
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(`[dev] ${label} failed to start: ${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`\n[dev] ${label} exited (code ${code ?? "null"}, signal ${signal ?? "none"}).`);
    shutdown(typeof code === "number" ? code : 1);
  });
  return child;
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killTree(child);
  // Belt and braces: free the ports in case a grandchild outlived its npm parent.
  freePort(BACKEND_PORT);
  freePort(WIDGET_PORT);
  process.exit(code);
}

function killTree(child) {
  if (!child || child.killed || child.pid === undefined) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    /* already gone */
  }
}

function freePort(port) {
  for (const pid of listeningPids(port)) {
    try {
      if (process.platform === "win32") execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
      else execSync(`kill -9 ${pid}`, { stdio: "ignore" });
      console.log(`[dev]   freed :${port} (pid ${pid})`);
    } catch {
      /* already gone */
    }
  }
}

function listeningPids(port) {
  const pids = new Set();
  try {
    if (process.platform === "win32") {
      const out = execSync("netstat -ano", { encoding: "utf8" });
      for (const line of out.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === "TCP" && parts[3] === "LISTENING" && parts[1]?.endsWith(`:${port}`)) {
          pids.add(parts[4]);
        }
      }
    } else {
      const out = execSync(`lsof -ti tcp:${port} 2>/dev/null || true`, {
        encoding: "utf8",
        shell: "/bin/sh",
      });
      for (const pid of out.split(/\s+/).filter(Boolean)) pids.add(pid);
    }
  } catch {
    /* nothing listening */
  }
  return [...pids];
}

function probeHealth() {
  return new Promise((resolve) => {
    const req = httpRequest(
      { host: "127.0.0.1", port: BACKEND_PORT, path: "/healthz", timeout: 2_000 },
      (res) => {
        res.resume();
        resolve((res.statusCode ?? 500) < 500);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeHealth()) return true;
    await delay(500);
  }
  return false;
}

function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(readFileSync(file, "utf8")) };
  } catch {
    return fallback;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
