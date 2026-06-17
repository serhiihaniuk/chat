#!/usr/bin/env node
// Local cross-platform launcher for the side-chat monorepo (NO Docker, NO Postgres).
//
// Runs the whole project locally for testing:
//   - backend  @side-chat/partner-ai-service  (tsx + Hono)  with FAKE provider + IN-MEMORY persistence
//   - frontend @side-chat/widget-harness       (Vite)        pointed at the backend
//
// Why this script exists:
//   server.ts does NOT read a .env file. It reads process.env synchronously at boot.
//   Therefore every SIDECHAT_* key (and PORT) must be INJECTED into the spawned child's env.
//
// Uses only Node built-ins. No new dependencies.
//
// Overridable via env vars (sensible defaults):
//   BACKEND_PORT   (default 8787)  -> injected as PORT into the backend child
//   WIDGET_PORT    (default 5173)
//   AUTH_TOKEN     (default local-compose-token) -> SIDECHAT_AUTH_BEARER_TOKEN AND the widget authToken
//   WORKSPACE_ID   (default workspace_local)
//   HOST           (default 127.0.0.1)
//   NPM_REGISTRY   (optional) -> passed to `npm install` as --registry <url>.
//                  If unset, npm uses your environment's .npmrc / NPM_CONFIG_REGISTRY.
//                  The committed package-lock.json pins registry.npmjs.org URLs, but
//                  npm 9+ rewrites them to the configured registry automatically
//                  (replace-registry-host=npmjs), so a mirroring private registry works.
//
// Node/npm: the repo declares Node >=24.15 <25 and npm >=11.12 for reproducible
//   `npm run verify`, but the app itself only needs Node >=22.12 (Vite 8 / tsx).
//   Node 22.16 runs both dev servers. There is no engine-strict in .npmrc, so a
//   lower Node/npm only produces EBADENGINE warnings, not a failed install.
//
// Flags:
//   --install   force `npm install` even if node_modules exists

import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { existsSync } from "node:fs";
import process from "node:process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// --------------------------------------------------------------------------
// Paths / constants
// --------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const BACKEND_WORKSPACE = "@side-chat/partner-ai-service";
const WIDGET_WORKSPACE = "@side-chat/widget-harness";

// Two tiers of version expectation:
//   RECOMMENDED = the repo's package.json engines pins (for reproducible verify).
//   MIN_RUNTIME = what the dev servers actually need to run (Vite 8 / tsx).
// Node 22.16 satisfies MIN_RUNTIME but not RECOMMENDED, so we note it and continue.
const RECOMMENDED = {
  node: ">=24.15.0 <25.0.0",
  npm: ">=11.12.0 <12.0.0",
};
const MIN_RUNTIME = {
  node: ">=22.12.0",
  npm: ">=10.0.0",
};

// Optional explicit registry for `npm install` (private registry support).
const NPM_REGISTRY = (process.env.NPM_REGISTRY || "").trim();

// Defaults grounded in verified facts:
//   DEFAULT_SERVICE_PORT = 8787, vite port 5173, default token local-compose-token,
//   workspace default workspace_local, harness mode default local-service.
const HOST = process.env.HOST || "127.0.0.1";
const BACKEND_PORT = Number(process.env.BACKEND_PORT || 8787);
const WIDGET_PORT = Number(process.env.WIDGET_PORT || 5173);
const AUTH_TOKEN = process.env.AUTH_TOKEN || "local-compose-token";
const WORKSPACE_ID = process.env.WORKSPACE_ID || "workspace_local";

const FORCE_INSTALL = process.argv.includes("--install");

const IS_WIN = process.platform === "win32";
// On Windows the npm executable is npm.cmd; child_process.spawn cannot exec a .cmd
// batch file directly. Use the explicit name + shell:true. process.execPath is wrong
// (it is the node binary, not npm).
const NPM = IS_WIN ? "npm.cmd" : "npm";

// --------------------------------------------------------------------------
// Tiny ANSI helpers (no dependency)
// --------------------------------------------------------------------------
const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};
const color = (c, s) => `${COLORS[c] || ""}${s}${COLORS.reset}`;
const logLauncher = (msg) => console.log(`${color("magenta", "[launcher]")} ${msg}`);
const warnLauncher = (msg) => console.warn(`${color("yellow", "[launcher]")} ${color("yellow", msg)}`);
const errLauncher = (msg) => console.error(`${color("red", "[launcher]")} ${color("red", msg)}`);

// --------------------------------------------------------------------------
// Semver range check (just enough for the two engines ranges ">=A <B")
// --------------------------------------------------------------------------
function parseVersion(v) {
  const m = String(v).trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function cmpVersion(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}
// Supports comparators: >= > <= < = (space-separated, all must hold).
function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v) return false;
  const parts = String(range).trim().split(/\s+/);
  for (const part of parts) {
    const m = part.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
    if (!m) return false;
    const op = m[1] || "=";
    const target = parseVersion(m[2]);
    if (!target) return false;
    const c = cmpVersion(v, target);
    if (op === ">=" && !(c >= 0)) return false;
    if (op === ">" && !(c > 0)) return false;
    if (op === "<=" && !(c <= 0)) return false;
    if (op === "<" && !(c < 0)) return false;
    if (op === "=" && c !== 0) return false;
  }
  return true;
}

// --------------------------------------------------------------------------
// Step 1: verify Node/npm versions (warn, do not hard-fail)
// --------------------------------------------------------------------------
function getNpmVersion() {
  return new Promise((resolve) => {
    // Mirror the repo's own safe Windows invocation (cmd.exe wrapper).
    const cmd = IS_WIN
      ? { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "npm -v"] }
      : { command: "npm", args: ["-v"] };
    let out = "";
    const child = spawn(cmd.command, cmd.args, { cwd: ROOT });
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("error", () => resolve(null));
    child.on("close", () => resolve(out.trim() || null));
  });
}

async function verifyRuntime() {
  const nodeVersion = process.version.replace(/^v/, "");
  if (!satisfies(nodeVersion, MIN_RUNTIME.node)) {
    warnLauncher(
      `Node ${nodeVersion} is below the runtime minimum "${MIN_RUNTIME.node}" (Vite 8 / tsx). ` +
        `The dev servers will likely fail to start. Please upgrade Node.`,
    );
  } else if (!satisfies(nodeVersion, RECOMMENDED.node)) {
    logLauncher(
      `Node ${nodeVersion} runs the app fine. (Repo pins ${RECOMMENDED.node} only for reproducible \`npm run verify\`.)`,
    );
  } else {
    logLauncher(`Node ${nodeVersion} OK (recommended ${RECOMMENDED.node})`);
  }

  const npmVersion = await getNpmVersion();
  if (!npmVersion) {
    warnLauncher("Could not determine npm version. Is npm on PATH?");
  } else if (!satisfies(npmVersion, MIN_RUNTIME.npm)) {
    warnLauncher(
      `npm ${npmVersion} is quite old; install may misbehave. Recommended ${RECOMMENDED.npm}.`,
    );
  } else if (!satisfies(npmVersion, RECOMMENDED.npm)) {
    logLauncher(
      `npm ${npmVersion} is fine for install. (Repo pins ${RECOMMENDED.npm} for verify; no engine-strict, so this only warns.)`,
    );
  } else {
    logLauncher(`npm ${npmVersion} OK (recommended ${RECOMMENDED.npm})`);
  }
}

// --------------------------------------------------------------------------
// Step 2: npm install (once, unless --install)
// --------------------------------------------------------------------------
function runNpmInstall() {
  return new Promise((resolve, reject) => {
    const args = ["install"];
    if (NPM_REGISTRY) {
      args.push("--registry", NPM_REGISTRY);
      logLauncher(`Using registry override: ${NPM_REGISTRY}`);
    } else {
      logLauncher("Using registry from your environment (.npmrc / NPM_CONFIG_REGISTRY).");
    }
    logLauncher("Running `npm install` at repo root...");
    const child = spawn(NPM, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: IS_WIN,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install exited with code ${code}`));
    });
  });
}

async function ensureInstalled() {
  const hasNodeModules = existsSync(path.join(ROOT, "node_modules"));
  if (FORCE_INSTALL) {
    logLauncher("--install flag passed; forcing install.");
    await runNpmInstall();
  } else if (!hasNodeModules) {
    logLauncher("node_modules not found; installing.");
    await runNpmInstall();
  } else {
    logLauncher("node_modules present; skipping install (pass --install to force).");
  }
}

// --------------------------------------------------------------------------
// Child process management
// --------------------------------------------------------------------------
/** @type {{ name: string, child: import("node:child_process").ChildProcess }[]} */
const children = [];
let shuttingDown = false;

function prefixStream(stream, label, labelColor, isErr) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const tag = color(labelColor, `[${label}]`);
      const out = isErr ? `${tag} ${line}` : `${tag} ${line}`;
      if (isErr) process.stderr.write(out + "\n");
      else process.stdout.write(out + "\n");
    }
  });
  stream.on("end", () => {
    if (buffer.length) {
      const tag = color(labelColor, `[${label}]`);
      if (isErr) process.stderr.write(`${tag} ${buffer}\n`);
      else process.stdout.write(`${tag} ${buffer}\n`);
    }
  });
}

function spawnDevServer({ name, labelColor, workspace, env }) {
  const args = ["run", "dev", "--workspace", workspace];
  logLauncher(`Starting ${color(labelColor, name)}: ${NPM} ${args.join(" ")}`);
  const child = spawn(NPM, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: IS_WIN,
  });
  prefixStream(child.stdout, name, labelColor, false);
  prefixStream(child.stderr, name, labelColor, true);
  child.on("error", (e) => {
    errLauncher(`${name} failed to spawn: ${e.message}`);
    shutdown(1);
  });
  child.on("close", (code, signal) => {
    if (shuttingDown) return;
    errLauncher(`${name} exited unexpectedly (code=${code} signal=${signal}). Shutting down.`);
    shutdown(code ?? 1);
  });
  children.push({ name, child });
  return child;
}

// Kill the whole process tree cross-platform. On Windows, npm spawns a tree of
// child processes (cmd -> npm -> tsx/vite); a plain child.kill() leaves orphans,
// so use `taskkill /T` to kill the tree by PID.
function killChild({ name, child }) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (IS_WIN) {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }
  } else {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  logLauncher("Shutting down child processes...");
  for (const entry of children) killChild(entry);
  // Give children a moment to die, then exit.
  setTimeout(() => process.exit(exitCode ?? 0), 1500);
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    logLauncher(`Received ${sig}.`);
    shutdown(0);
  });
}

// --------------------------------------------------------------------------
// Wait for backend /healthz to report ok
// --------------------------------------------------------------------------
function probeHealth() {
  return new Promise((resolve) => {
    const req = httpRequest(
      { host: HOST, port: BACKEND_PORT, path: "/healthz", method: "GET", timeout: 2000 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve(false);
          try {
            const json = JSON.parse(body);
            resolve(json && json.status === "ok");
          } catch {
            resolve(false);
          }
        });
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

async function waitForHealth({ timeoutMs = 60000, intervalMs = 500 } = {}) {
  const start = Date.now();
  logLauncher(`Waiting for backend health at http://${HOST}:${BACKEND_PORT}/healthz ...`);
  // small initial delay so the first attempts don't all hit a not-yet-listening port
  while (Date.now() - start < timeoutMs) {
    if (shuttingDown) return false;
    const ok = await probeHealth();
    if (ok) {
      logLauncher(color("green", "Backend healthz reported ok."));
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main() {
  logLauncher(`Repo root: ${ROOT}`);
  logLauncher(`Platform: ${os.platform()} ${os.arch()}`);

  await verifyRuntime();
  await ensureInstalled();

  // Backend env. server.ts reads process.env synchronously (no .env loading),
  // so everything must be injected here.
  //   PORT                       -> backend listen port (NOT a SIDECHAT_ var)
  //   SIDECHAT_PROFILE           -> development (fake provider allowed, memory persistence default)
  //   SIDECHAT_PROVIDER          -> fake
  //   SIDECHAT_AUTH_BEARER_TOKEN -> bearer token the harness must present
  //   (no SIDECHAT_DATABASE_URL  -> persistence defaults to in-memory)
  const backendEnv = {
    PORT: String(BACKEND_PORT),
    SIDECHAT_PROFILE: "development",
    SIDECHAT_PROVIDER: "fake",
    SIDECHAT_POLICY_MODE: "allow_all",
    SIDECHAT_AUTH_BEARER_TOKEN: AUTH_TOKEN,
  };
  // Defensive: ensure no inherited DATABASE_URL forces Postgres.
  delete process.env.SIDECHAT_DATABASE_URL;

  spawnDevServer({
    name: "backend",
    labelColor: "cyan",
    workspace: BACKEND_WORKSPACE,
    env: backendEnv,
  });

  const healthy = await waitForHealth();
  if (!healthy) {
    errLauncher("Backend did not become healthy in time. Aborting.");
    shutdown(1);
    return;
  }

  // Widget env. The only harness-specific env var is the proxy target; point it
  // at the actual backend port.
  const widgetEnv = {
    SIDECHAT_WIDGET_HARNESS_API_TARGET: `http://${HOST}:${BACKEND_PORT}`,
  };

  spawnDevServer({
    name: "widget",
    labelColor: "blue",
    workspace: WIDGET_WORKSPACE,
    env: widgetEnv,
  });

  // The harness sends `Authorization: Bearer <authToken>`, which the backend
  // validates against SIDECHAT_AUTH_BEARER_TOKEN -> authToken MUST equal AUTH_TOKEN.
  const widgetUrl =
    `http://${HOST}:${WIDGET_PORT}/?mode=local-service` +
    `&authToken=${encodeURIComponent(AUTH_TOKEN)}` +
    `&workspaceId=${encodeURIComponent(WORKSPACE_ID)}`;

  // Give Vite a moment to bind before printing the banner.
  setTimeout(() => {
    if (shuttingDown) return;
    const line = "=".repeat(72);
    console.log("\n" + color("green", line));
    console.log(color("bold", "  Side-chat local (fake provider + in-memory persistence) is ready"));
    console.log(color("green", line));
    console.log(`  Backend (healthz): ${color("cyan", `http://${HOST}:${BACKEND_PORT}/healthz`)}`);
    console.log(`  Bearer token:      ${color("dim", AUTH_TOKEN)}`);
    console.log("");
    console.log(`  ${color("bold", "Open this URL to talk to the local fake backend:")}`);
    console.log(`  ${color("yellow", widgetUrl)}`);
    console.log(color("green", line));
    console.log(color("dim", "  Press Ctrl+C to stop both servers."));
    console.log(color("green", line) + "\n");
  }, 2500);
}

main().catch((e) => {
  errLauncher(e?.stack || String(e));
  shutdown(1);
});
