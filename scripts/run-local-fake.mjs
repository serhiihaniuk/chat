#!/usr/bin/env node
// Local cross-platform launcher for the side-chat monorepo (NO Docker, NO Postgres).
//
// Runs the whole project locally:
//   - backend  @side-chat/partner-ai-service  (tsx + Hono)
//   - frontend @side-chat/widget-harness       (Vite), exposed the workbench way
//
// This version PROMPTS you interactively for the model + exposure settings
// (provider, API key, model, workspace, public domain, token). Anything you
// answer can also be preset via the matching env var (then the prompt just shows
// it as the default). In a non-interactive shell it falls back to env/defaults.
//
// Why injected env: server.ts reads process.env synchronously at boot (no .env
// file), so every SIDECHAT_* key must be injected into the spawned child.
//
// Widget exposure is hardcoded to the workbench convention:
//   - port 8080 (strictPort), host 0.0.0.0, endpoint name "workbench-ui"
//   - public host = <workspaceId>-workbench-ui-8080.<domain>
//   - __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS set to that public host
//
// Uses only Node built-ins. No new dependencies.
//
// Flags:
//   --install   force `npm install` even if node_modules exists
//   --yes       skip prompts, use env vars / defaults only

import { spawn, execSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import readline from "node:readline";
import { Writable } from "node:stream";
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

// Workbench exposure convention (hardcoded, not configurable).
const WIDGET_PORT = 8080;
const WIDGET_ENDPOINT_NAME = "workbench-ui";
const WIDGET_BIND_HOST = "0.0.0.0";

// Saved answers live next to this script so re-runs remember your inputs.
const CONFIG_FILE = path.join(__dirname, ".run-local-fake.json");

// Version expectations.
const RECOMMENDED = { node: ">=24.15.0 <25.0.0", npm: ">=11.12.0 <12.0.0" };
const MIN_RUNTIME = { node: ">=22.12.0", npm: ">=10.0.0" };

const NPM_REGISTRY = (process.env.NPM_REGISTRY || "").trim();
const FORCE_INSTALL = process.argv.includes("--install");
const SKIP_PROMPTS = process.argv.includes("--yes") || !process.stdin.isTTY;

const IS_WIN = process.platform === "win32";
// On Windows npm is npm.cmd; spawn needs the explicit name + shell:true.
const NPM = IS_WIN ? "npm.cmd" : "npm";

// --------------------------------------------------------------------------
// Tiny ANSI helpers
// --------------------------------------------------------------------------
const COLORS = {
  reset: "\x1b[0m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", bold: "\x1b[1m",
};
const color = (c, s) => `${COLORS[c] || ""}${s}${COLORS.reset}`;
const logLauncher = (msg) => console.log(`${color("magenta", "[launcher]")} ${msg}`);
const warnLauncher = (msg) => console.warn(`${color("yellow", "[launcher]")} ${color("yellow", msg)}`);
const errLauncher = (msg) => console.error(`${color("red", "[launcher]")} ${color("red", msg)}`);

// --------------------------------------------------------------------------
// Saved config (remembers your answers between runs)
// --------------------------------------------------------------------------
function loadSaved() {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf8");
    const obj = JSON.parse(raw);
    logLauncher(`Loaded saved answers from ${path.relative(ROOT, CONFIG_FILE)}.`);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
function saveConfig(cfg) {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
    // Best-effort lock-down: the file may contain the API key.
    if (!IS_WIN) {
      try { chmodSync(CONFIG_FILE, 0o600); } catch { /* ignore */ }
    }
    logLauncher(`Saved your answers to ${path.relative(ROOT, CONFIG_FILE)} (reused next run; contains the API key — keep it out of git).`);
  } catch (e) {
    warnLauncher(`Could not save config: ${e.message}`);
  }
}
// Default precedence: saved file -> env var -> hardcoded fallback.
function pick(saved, key, envVal, fallback) {
  const has = Object.prototype.hasOwnProperty.call(saved, key);
  if (has && saved[key] !== undefined && saved[key] !== "") return String(saved[key]);
  if (envVal) return envVal;
  return fallback;
}

// --------------------------------------------------------------------------
// Free a TCP port by killing whatever is listening on it.
// --------------------------------------------------------------------------
function pidsOnPort(port) {
  try {
    if (IS_WIN) {
      const out = execSync("netstat -ano -p tcp", { encoding: "utf8" });
      const pids = new Set();
      for (const line of out.split("\n")) {
        if (line.includes(`:${port} `) && /LISTENING/i.test(line)) {
          const pid = line.trim().split(/\s+/).pop();
          if (/^\d+$/.test(pid)) pids.add(pid);
        }
      }
      return [...pids];
    }
    // POSIX: prefer lsof, fall back to fuser.
    try {
      const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null`, { encoding: "utf8" });
      return out.split("\n").map((s) => s.trim()).filter(Boolean);
    } catch {
      try {
        const out = execSync(`fuser ${port}/tcp 2>/dev/null`, { encoding: "utf8" });
        return out.trim().split(/\s+/).filter(Boolean);
      } catch {
        return [];
      }
    }
  } catch {
    return [];
  }
}
function freePort(port, label) {
  const self = String(process.pid);
  const pids = pidsOnPort(port).filter((p) => p !== self);
  if (!pids.length) return;
  warnLauncher(`Port ${port} (${label}) is busy — killing PID(s) ${pids.join(", ")}.`);
  for (const pid of pids) {
    try {
      if (IS_WIN) execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
      else process.kill(Number(pid), "SIGKILL");
    } catch (e) {
      warnLauncher(`Could not kill PID ${pid}: ${e.message}`);
    }
  }
  // Give the OS a moment to release the socket before strictPort binds.
  try { execSync(IS_WIN ? "ping 127.0.0.1 -n 2 >NUL" : "sleep 0.7", { stdio: "ignore" }); } catch { /* ignore */ }
}

// --------------------------------------------------------------------------
// Interactive prompts (mutable-output trick so the API key can be masked)
// --------------------------------------------------------------------------
let promptMuted = false;
const mutedOut = new Writable({
  write(chunk, _enc, cb) {
    if (!promptMuted) process.stdout.write(chunk);
    cb();
  },
});
let rl = null;
function openPrompts() {
  if (SKIP_PROMPTS) return;
  rl = readline.createInterface({ input: process.stdin, output: mutedOut, terminal: true });
}
function closePrompts() {
  if (rl) rl.close();
  rl = null;
}
// Plain question with a default (Enter keeps the default).
function ask(question, def = "") {
  if (SKIP_PROMPTS || !rl) return Promise.resolve(def);
  const hint = def ? color("dim", ` [${def}]`) : "";
  return new Promise((resolve) => {
    rl.question(`${color("cyan", "?")} ${question}${hint}: `, (answer) => {
      resolve(answer.trim() || def);
    });
  });
}
// Masked question (typed characters are not echoed).
function askSecret(question, def = "") {
  if (SKIP_PROMPTS || !rl) return Promise.resolve(def);
  const hint = def ? color("dim", " [keep current]") : "";
  process.stdout.write(`${color("cyan", "?")} ${question}${hint}: `);
  promptMuted = true;
  return new Promise((resolve) => {
    rl.question("", (answer) => {
      promptMuted = false;
      process.stdout.write("\n");
      resolve(answer.trim() || def);
    });
  });
}
async function askYesNo(question, defYes) {
  const def = defYes ? "Y/n" : "y/N";
  const a = (await ask(`${question} (${def})`, "")).toLowerCase();
  if (!a) return defYes;
  return a === "y" || a === "yes";
}

// --------------------------------------------------------------------------
// Semver range check
// --------------------------------------------------------------------------
function parseVersion(v) {
  const m = String(v).trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function cmpVersion(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}
function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v) return false;
  for (const part of String(range).trim().split(/\s+/)) {
    const m = part.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
    if (!m) return false;
    const op = m[1] || "=";
    const t = parseVersion(m[2]);
    if (!t) return false;
    const c = cmpVersion(v, t);
    if (op === ">=" && !(c >= 0)) return false;
    if (op === ">" && !(c > 0)) return false;
    if (op === "<=" && !(c <= 0)) return false;
    if (op === "<" && !(c < 0)) return false;
    if (op === "=" && c !== 0) return false;
  }
  return true;
}

// --------------------------------------------------------------------------
// Version check (warn, do not hard-fail)
// --------------------------------------------------------------------------
function getNpmVersion() {
  return new Promise((resolve) => {
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
    warnLauncher(`Node ${nodeVersion} is below "${MIN_RUNTIME.node}" (Vite 8 / tsx); dev servers may not start.`);
  } else if (!satisfies(nodeVersion, RECOMMENDED.node)) {
    logLauncher(`Node ${nodeVersion} runs the app fine. (Repo pins ${RECOMMENDED.node} for \`npm run verify\` only.)`);
  } else {
    logLauncher(`Node ${nodeVersion} OK.`);
  }
  const npmVersion = await getNpmVersion();
  if (!npmVersion) warnLauncher("Could not determine npm version. Is npm on PATH?");
  else if (!satisfies(npmVersion, MIN_RUNTIME.npm)) warnLauncher(`npm ${npmVersion} is very old; install may misbehave.`);
  else logLauncher(`npm ${npmVersion} OK.`);
}

// --------------------------------------------------------------------------
// npm install
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
    const child = spawn(NPM, args, { cwd: ROOT, stdio: "inherit", shell: IS_WIN });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`npm install exited ${code}`))));
  });
}
async function ensureInstalled() {
  const hasNodeModules = existsSync(path.join(ROOT, "node_modules"));
  if (FORCE_INSTALL) { logLauncher("--install: forcing install."); await runNpmInstall(); }
  else if (!hasNodeModules) { logLauncher("node_modules missing; installing."); await runNpmInstall(); }
  else logLauncher("node_modules present; skipping install (use --install to force).");
}

// --------------------------------------------------------------------------
// Child process management
// --------------------------------------------------------------------------
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
      const out = `${color(labelColor, `[${label}]`)} ${line}\n`;
      (isErr ? process.stderr : process.stdout).write(out);
    }
  });
  stream.on("end", () => {
    if (buffer.length) (isErr ? process.stderr : process.stdout).write(`${color(labelColor, `[${label}]`)} ${buffer}\n`);
  });
}

function spawnDevServer({ name, labelColor, workspace, env, extraArgs = [] }) {
  const args = ["run", "dev", "--workspace", workspace];
  if (extraArgs.length) args.push("--", ...extraArgs);
  logLauncher(`Starting ${color(labelColor, name)}: ${NPM} ${args.join(" ")}`);
  const child = spawn(NPM, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: IS_WIN,
  });
  prefixStream(child.stdout, name, labelColor, false);
  prefixStream(child.stderr, name, labelColor, true);
  child.on("error", (e) => { errLauncher(`${name} failed to spawn: ${e.message}`); shutdown(1); });
  child.on("close", (code, signal) => {
    if (shuttingDown) return;
    errLauncher(`${name} exited unexpectedly (code=${code} signal=${signal}). Shutting down.`);
    shutdown(code ?? 1);
  });
  children.push({ name, child });
  return child;
}

function killChild({ child }) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (IS_WIN) {
    try { spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }); }
    catch { try { child.kill(); } catch { /* ignore */ } }
  } else {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  }
}
function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  closePrompts();
  logLauncher("Shutting down child processes...");
  for (const entry of children) killChild(entry);
  setTimeout(() => process.exit(exitCode ?? 0), 1500);
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { logLauncher(`Received ${sig}.`); shutdown(0); });
}

// --------------------------------------------------------------------------
// Wait for backend /healthz
// --------------------------------------------------------------------------
function probeHealth(port) {
  return new Promise((resolve) => {
    const req = httpRequest({ host: "127.0.0.1", port, path: "/healthz", method: "GET", timeout: 2000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode !== 200) return resolve(false);
        try { const j = JSON.parse(body); resolve(j && j.status === "ok"); } catch { resolve(false); }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}
async function waitForHealth(port, { timeoutMs = 60000, intervalMs = 500 } = {}) {
  const start = Date.now();
  logLauncher(`Waiting for backend health at http://127.0.0.1:${port}/healthz ...`);
  while (Date.now() - start < timeoutMs) {
    if (shuttingDown) return false;
    if (await probeHealth(port)) { logLauncher(color("green", "Backend healthz reported ok.")); return true; }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// --------------------------------------------------------------------------
// Collect config interactively
// --------------------------------------------------------------------------
async function collectConfig() {
  const saved = loadSaved();
  openPrompts();
  if (SKIP_PROMPTS) logLauncher("Non-interactive (--yes or no TTY): using saved file / env / defaults.");
  else console.log(color("bold", "\nConfigure this run (press Enter to accept the [default]):\n"));

  const cfg = {};

  // Provider
  let provider = (await ask("Provider [fake/openai]",
    pick(saved, "provider", process.env.SIDECHAT_PROVIDER, "openai"))).toLowerCase();
  if (provider !== "fake" && provider !== "openai") {
    warnLauncher(`Unknown provider "${provider}", using "openai".`);
    provider = "openai";
  }
  cfg.provider = provider;

  if (provider === "openai") {
    const savedKey = pick(saved, "apiKey", process.env.SIDECHAT_OPENAI_API_KEY, "");
    cfg.apiKey = await askSecret("API key", savedKey);
    while (!cfg.apiKey) {
      errLauncher("API key is required for the real model.");
      cfg.apiKey = await askSecret("API key", "");
      if (SKIP_PROMPTS) break;
    }
    cfg.models = await ask("Allowed models (comma-separated, first is default)",
      pick(saved, "models", process.env.SIDECHAT_ALLOWED_MODELS, "gpt-5.4-mini"));
    cfg.baseUrl = await ask(
      "API base URL — OpenAI-compatible endpoint root, e.g. https://gateway/v1 (blank = api.openai.com)",
      pick(saved, "baseUrl", process.env.SIDECHAT_OPENAI_BASE_URL, ""),
    );
  }

  cfg.workspaceId = await ask("Workspace ID",
    pick(saved, "workspaceId", process.env.WORKSPACE_ID, "workspace_local"));
  cfg.authToken = await ask("Auth bearer token",
    pick(saved, "authToken", process.env.AUTH_TOKEN, "local-compose-token"));
  cfg.backendPort = Number(await ask(
    `Backend port (internal; MUST differ from the widget's ${WIDGET_PORT})`,
    pick(saved, "backendPort", process.env.BACKEND_PORT, "8787"))) || 8787;
  if (cfg.backendPort === WIDGET_PORT) {
    // The widget owns WIDGET_PORT (8080) and is reached publicly; the backend is
    // internal (proxied via /api). If they collide, freePort(widget) would kill
    // the backend. Force a safe internal port instead.
    warnLauncher(`Backend port ${WIDGET_PORT} clashes with the widget — using 8787 for the backend instead.`);
    cfg.backendPort = 8787;
  }

  // Public domain for the widget host. Blank => expose on localhost only.
  cfg.domain = await ask(
    "Public domain for the widget (blank = localhost only).\n" +
      `  Public host becomes: <workspaceId>-${WIDGET_ENDPOINT_NAME}-${WIDGET_PORT}.<domain>\n  domain`,
    pick(saved, "domain", process.env.SIDECHAT_PUBLIC_DOMAIN, ""),
  );

  closePrompts();
  saveConfig(cfg);
  return cfg;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main() {
  logLauncher(`Repo root: ${ROOT}`);
  logLauncher(`Platform: ${os.platform()} ${os.arch()}`);

  await verifyRuntime();
  await ensureInstalled();

  const cfg = await collectConfig();

  // ---- Backend env (server.ts reads process.env at boot; inject everything) ----
  // Stay on the development profile so in-memory persistence works with no DB.
  const backendEnv = {
    PORT: String(cfg.backendPort),
    SIDECHAT_PROFILE: process.env.SIDECHAT_PROFILE || "development",
    SIDECHAT_POLICY_MODE: process.env.SIDECHAT_POLICY_MODE || "allow_all",
    SIDECHAT_AUTH_BEARER_TOKEN: cfg.authToken,
    SIDECHAT_PROVIDER: cfg.provider,
  };
  if (cfg.provider === "fake") {
    delete process.env.SIDECHAT_DATABASE_URL; // keep memory persistence
    logLauncher("Provider: fake (echo model).");
  } else {
    backendEnv.SIDECHAT_OPENAI_API_KEY = cfg.apiKey;
    backendEnv.SIDECHAT_ALLOWED_MODELS = cfg.models;
    if (cfg.baseUrl) backendEnv.SIDECHAT_OPENAI_BASE_URL = cfg.baseUrl;
    if (process.env.SIDECHAT_OPENAI_REASONING_EFFORT)
      backendEnv.SIDECHAT_OPENAI_REASONING_EFFORT = process.env.SIDECHAT_OPENAI_REASONING_EFFORT;
    if (process.env.SIDECHAT_OPENAI_REASONING_SUMMARY)
      backendEnv.SIDECHAT_OPENAI_REASONING_SUMMARY = process.env.SIDECHAT_OPENAI_REASONING_SUMMARY;
    logLauncher(`Provider: openai (models: ${cfg.models}). Persistence: in-memory.`);
  }

  freePort(cfg.backendPort, "backend");
  spawnDevServer({ name: "backend", labelColor: "cyan", workspace: BACKEND_WORKSPACE, env: backendEnv });

  const healthy = await waitForHealth(cfg.backendPort);
  if (!healthy) { errLauncher("Backend did not become healthy in time. Aborting."); shutdown(1); return; }

  // ---- Widget exposure (workbench convention) ----
  const publicHost = cfg.domain
    ? `${cfg.workspaceId}-${WIDGET_ENDPOINT_NAME}-${WIDGET_PORT}.${cfg.domain}`
    : "";
  const widgetEnv = {
    SIDECHAT_WIDGET_HARNESS_API_TARGET: `http://127.0.0.1:${cfg.backendPort}`,
  };
  if (publicHost) widgetEnv.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = publicHost;

  freePort(WIDGET_PORT, "widget");
  spawnDevServer({
    name: "widget",
    labelColor: "blue",
    workspace: WIDGET_WORKSPACE,
    env: widgetEnv,
    extraArgs: ["--host", WIDGET_BIND_HOST, "--port", String(WIDGET_PORT), "--strictPort"],
  });

  const base = publicHost ? `https://${publicHost}` : `http://127.0.0.1:${WIDGET_PORT}`;
  const widgetUrl =
    `${base}/?mode=local-service` +
    `&authToken=${encodeURIComponent(cfg.authToken)}` +
    `&workspaceId=${encodeURIComponent(cfg.workspaceId)}`;

  setTimeout(() => {
    if (shuttingDown) return;
    const line = "=".repeat(72);
    console.log("\n" + color("green", line));
    console.log(color("bold", `  Side-chat local (${cfg.provider} provider + in-memory persistence) is ready`));
    console.log(color("green", line));
    console.log(`  Backend (healthz): ${color("cyan", `http://127.0.0.1:${cfg.backendPort}/healthz`)}`);
    console.log(`  Widget bind:       ${color("dim", `${WIDGET_BIND_HOST}:${WIDGET_PORT} (strictPort)`)}`);
    if (publicHost) console.log(`  Public host:       ${color("dim", publicHost)}`);
    console.log(`  Bearer token:      ${color("dim", cfg.authToken)}`);
    console.log("");
    console.log(`  ${color("bold", "Open this URL:")}`);
    console.log(`  ${color("yellow", widgetUrl)}`);
    console.log(color("green", line));
    console.log(color("dim", "  Press Ctrl+C to stop both servers."));
    console.log(color("green", line) + "\n");
  }, 2500);
}

main().catch((e) => { errLauncher(e?.stack || String(e)); shutdown(1); });
