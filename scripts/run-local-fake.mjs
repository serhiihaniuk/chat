#!/usr/bin/env node
// Local cross-platform launcher for the side-chat monorepo (NO Docker, NO Postgres).
//
// Runs the local Side Chat servers so YOUR OWN app can embed the widget:
//   - backend  @side-chat/partner-ai-service  (tsx + Hono)
//   - widget   @side-chat/widget-harness       (Vite), served under the frame path
//
// This version PROMPTS you interactively for the model/runtime settings
// (provider, API key, model, workspace, token, backend port, widget port).
// Anything you answer can also be preset via the matching env var (then the
// prompt just shows it as the default). In a non-interactive shell it falls back
// to env/defaults.
//
// Providers:
//   - fake    in-memory showcase model + mock tools (default; no key needed)
//   - openai  real OpenAI-compatible models (prompts for API key + models)
//   - azure   boots the standalone Azure + in-memory "fake db" config
//             (sidechat.azure.config.ts) and prompts for the Azure endpoint,
//             API key, api-version, and gpt-4o deployment name
//
// Why injected env: server.ts reads process.env synchronously at boot (no .env
// file), so every SIDECHAT_* key must be injected into the spawned child.
//
// This script does NOT start a host page. Your own app is the host: point its
// dev proxy at the two servers above and embed the iframe (see
// docs/operations/embed-widget-iframe.md). Widget exposure defaults:
//   - default widget port 5174 (strictPort), host 0.0.0.0
//   - default frame proxy path "/side-chat-frame/" (your app proxies it to 5174)
//   - endpoint name "side-chat-widget" by default
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

const DEFAULT_BACKEND_PORT = 8787;
const DEFAULT_WIDGET_PORT = 5174;
const DEFAULT_WORKBENCH_PORT = 8080;
const DEFAULT_WIDGET_ENDPOINT_NAME = "side-chat-widget";
const DEFAULT_WIDGET_BIND_HOST = "0.0.0.0";
const DEFAULT_WIDGET_FRAME_PATH = "/side-chat-frame";

// The azure provider boots the standalone Azure + in-memory ("fake db") config
// instead of the default sidechat.config.ts; the server selects it via
// SIDECHAT_CONFIG_PATH. Endpoint/key/deployment are prompted (see collectConfig).
const AZURE_CONFIG_PATH = path.join(ROOT, "apps", "partner-ai-service", "sidechat.azure.config.ts");
const DEFAULT_AZURE_API_VERSION = "2024-12-01-preview";
const DEFAULT_AZURE_GPT_4O_DEPLOYMENT = "gpt-4o";

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
const warnLauncher = (msg) =>
  console.warn(`${color("yellow", "[launcher]")} ${color("yellow", msg)}`);
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
      try {
        chmodSync(CONFIG_FILE, 0o600);
      } catch {
        /* ignore */
      }
    }
    logLauncher(
      `Saved your answers to ${path.relative(ROOT, CONFIG_FILE)} (reused next run; contains the API key - keep it out of git).`,
    );
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
function readPort(value, fallback, label) {
  const port = Number(value);
  if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
  warnLauncher(`Invalid ${label} "${value}", using ${fallback}.`);
  return fallback;
}
function readEnvValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return "";
}
function normalizeFramePath(value) {
  const trimmed = String(value || DEFAULT_WIDGET_FRAME_PATH).trim();
  if (!trimmed || trimmed === "/") return "/";

  const withoutEdges = trimmed.replace(/^\/+/u, "").replace(/\/+$/u, "");
  return `/${withoutEdges}`;
}
function frameBasePath(framePath) {
  return framePath === "/" ? "/" : `${framePath}/`;
}

// --------------------------------------------------------------------------
// Free a TCP port by killing whatever is listening on it.
// --------------------------------------------------------------------------
function pidsOnPort(port) {
  try {
    return IS_WIN ? pidsOnWindowsPort(port) : pidsOnPosixPort(port);
  } catch {
    return [];
  }
}
function pidsOnWindowsPort(port) {
  const out = execSync("netstat -ano -p tcp", { encoding: "utf8" });
  const pids = new Set();
  for (const line of out.split("\n")) {
    if (!line.includes(`:${port} `) || !/LISTENING/i.test(line)) continue;
    const pid = line.trim().split(/\s+/).pop();
    if (/^\d+$/.test(pid)) pids.add(pid);
  }
  return [...pids];
}
function pidsOnPosixPort(port) {
  const lsofPids = pidsFromCommand(`lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null`);
  return lsofPids.length ? lsofPids : pidsFromCommand(`fuser ${port}/tcp 2>/dev/null`);
}
function pidsFromCommand(command) {
  try {
    const out = execSync(command, { encoding: "utf8" });
    return out.trim().split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}
function freePort(port, label) {
  const self = String(process.pid);
  const pids = pidsOnPort(port).filter((p) => p !== self);
  if (!pids.length) return;
  warnLauncher(`Port ${port} (${label}) is busy - killing PID(s) ${pids.join(", ")}.`);
  for (const pid of pids) {
    try {
      if (IS_WIN) execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
      else process.kill(Number(pid), "SIGKILL");
    } catch (e) {
      warnLauncher(`Could not kill PID ${pid}: ${e.message}`);
    }
  }
  // Give the OS a moment to release the socket before strictPort binds.
  try {
    execSync(IS_WIN ? "ping 127.0.0.1 -n 2 >NUL" : "sleep 0.7", { stdio: "ignore" });
  } catch {
    /* ignore */
  }
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
// --------------------------------------------------------------------------
// Semver range check
// --------------------------------------------------------------------------
function parseVersion(v) {
  const m = String(v)
    .trim()
    .replace(/^v/, "")
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function cmpVersion(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}
function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v) return false;
  return String(range)
    .trim()
    .split(/\s+/)
    .every((part) => satisfiesComparator(v, part));
}
function satisfiesComparator(version, part) {
  const comparator = readComparator(part);
  if (!comparator) return false;
  return compareByOperator(cmpVersion(version, comparator.version), comparator.operator);
}
function readComparator(part) {
  const match = part.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
  const parsedVersion = match ? parseVersion(match[2]) : null;
  if (!match || !parsedVersion) return null;
  return { operator: match[1] || "=", version: parsedVersion };
}
function compareByOperator(comparison, operator) {
  switch (operator) {
    case ">=":
      return comparison >= 0;
    case ">":
      return comparison > 0;
    case "<=":
      return comparison <= 0;
    case "<":
      return comparison < 0;
    case "=":
      return comparison === 0;
  }
  return false;
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
    warnLauncher(
      `Node ${nodeVersion} is below "${MIN_RUNTIME.node}" (Vite 8 / tsx); dev servers may not start.`,
    );
  } else if (!satisfies(nodeVersion, RECOMMENDED.node)) {
    logLauncher(
      `Node ${nodeVersion} runs the app fine. (Repo pins ${RECOMMENDED.node} for \`npm run verify\` only.)`,
    );
  } else {
    logLauncher(`Node ${nodeVersion} OK.`);
  }
  const npmVersion = await getNpmVersion();
  if (!npmVersion) warnLauncher("Could not determine npm version. Is npm on PATH?");
  else if (!satisfies(npmVersion, MIN_RUNTIME.npm))
    warnLauncher(`npm ${npmVersion} is very old; install may misbehave.`);
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
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`npm install exited ${code}`)),
    );
  });
}
async function ensureInstalled() {
  const hasNodeModules = existsSync(path.join(ROOT, "node_modules"));
  if (FORCE_INSTALL) {
    logLauncher("--install: forcing install.");
    await runNpmInstall();
  } else if (!hasNodeModules) {
    logLauncher("node_modules missing; installing.");
    await runNpmInstall();
  } else logLauncher("node_modules present; skipping install (use --install to force).");
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
    if (buffer.length)
      (isErr ? process.stderr : process.stdout).write(
        `${color(labelColor, `[${label}]`)} ${buffer}\n`,
      );
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

function deriveDevpodDomain() {
  const proxyUri = process.env.VSCODE_PROXY_URI;
  if (!proxyUri) return "";

  try {
    const proxyHost = new URL(proxyUri).hostname;
    const workspaceId = process.env.DEVWORKSPACE_ID || process.env.DEVWORKSPACE_NAME || "";

    if (workspaceId) {
      const knownPrefix = `${workspaceId}-vscode-latest-50001.`;
      if (proxyHost.startsWith(knownPrefix)) return proxyHost.slice(knownPrefix.length);
    }

    const firstDotIndex = proxyHost.indexOf(".");
    return firstDotIndex > -1 ? proxyHost.slice(firstDotIndex + 1) : "";
  } catch {
    return "";
  }
}

function deriveWidgetPublicHost(endpointName, port) {
  const explicitHost = readEnvValue("SIDECHAT_WIDGET_PUBLIC_HOST", "WIDGET_PUBLIC_HOST")
    .replace(/^https?:\/\//u, "")
    .replace(/\/$/u, "");
  if (explicitHost) return explicitHost;

  const workspaceId = process.env.DEVWORKSPACE_ID || process.env.DEVWORKSPACE_NAME || "";
  const domain = readEnvValue("SIDECHAT_PUBLIC_DOMAIN") || deriveDevpodDomain();
  if (!workspaceId || !domain) return "";

  return `${workspaceId}-${endpointName}-${port}.${domain}`;
}

function killChild({ child }) {
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
  closePrompts();
  logLauncher("Shutting down child processes...");
  for (const entry of children) killChild(entry);
  setTimeout(() => process.exit(exitCode ?? 0), 1500);
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    logLauncher(`Received ${sig}.`);
    shutdown(0);
  });
}

// --------------------------------------------------------------------------
// Wait for backend /healthz
// --------------------------------------------------------------------------
function probeHealth(port) {
  return new Promise((resolve) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path: "/healthz", method: "GET", timeout: 2000 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve(false);
          try {
            const j = JSON.parse(body);
            resolve(j && j.status === "ok");
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
async function waitForHealth(port, { timeoutMs = 60000, intervalMs = 500 } = {}) {
  const start = Date.now();
  logLauncher(`Waiting for backend health at http://127.0.0.1:${port}/healthz ...`);
  while (Date.now() - start < timeoutMs) {
    if (shuttingDown) return false;
    if (await probeHealth(port)) {
      logLauncher(color("green", "Backend healthz reported ok."));
      return true;
    }
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
  if (SKIP_PROMPTS)
    logLauncher("Non-interactive (--yes or no TTY): using saved file / env / defaults.");
  else console.log(color("bold", "\nConfigure this run (press Enter to accept the [default]):\n"));

  const cfg = {};

  // Provider. This launcher is the one-command demo path, so fake is the default.
  // azure boots the standalone Azure + in-memory config (sidechat.azure.config.ts).
  let provider = (
    await ask(
      "Provider [fake/openai/azure]",
      pick(saved, "provider", process.env.SIDECHAT_PROVIDER, "fake"),
    )
  ).toLowerCase();
  if (provider !== "fake" && provider !== "openai" && provider !== "azure") {
    warnLauncher(`Unknown provider "${provider}", using "fake".`);
    provider = "fake";
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
    cfg.models = await ask(
      "Allowed models (comma-separated, first is default)",
      pick(saved, "models", process.env.SIDECHAT_ALLOWED_MODELS, "gpt-5.4-mini"),
    );
    cfg.baseUrl = await ask(
      "API base URL - OpenAI-compatible endpoint root, e.g. https://gateway/v1 (blank = api.openai.com)",
      pick(saved, "baseUrl", process.env.SIDECHAT_OPENAI_BASE_URL, ""),
    );
  }

  if (provider === "azure") {
    // Required fields the Azure config (sidechat.azure.config.ts) reads from env.
    const savedKey = pick(saved, "azureApiKey", process.env.SIDECHAT_AZURE_OPENAI_API_KEY, "");
    cfg.azureApiKey = await askSecret("Azure OpenAI API key", savedKey);
    while (!cfg.azureApiKey) {
      errLauncher("Azure OpenAI API key is required.");
      cfg.azureApiKey = await askSecret("Azure OpenAI API key", "");
      if (SKIP_PROMPTS) break;
    }
    cfg.azureEndpoint = await ask(
      "Azure resource endpoint, e.g. https://<resource>.cognitiveservices.azure.com",
      pick(saved, "azureEndpoint", process.env.SIDECHAT_AZURE_OPENAI_ENDPOINT, ""),
    );
    while (!cfg.azureEndpoint) {
      errLauncher("Azure resource endpoint is required.");
      cfg.azureEndpoint = await ask("Azure resource endpoint", "");
      if (SKIP_PROMPTS) break;
    }
    cfg.azureApiVersion = await ask(
      "Azure REST api-version",
      pick(
        saved,
        "azureApiVersion",
        process.env.SIDECHAT_AZURE_OPENAI_API_VERSION,
        DEFAULT_AZURE_API_VERSION,
      ),
    );
    cfg.azureDeploymentGpt4o = await ask(
      "Azure deployment name for gpt-4o",
      pick(
        saved,
        "azureDeploymentGpt4o",
        process.env.SIDECHAT_AZURE_DEPLOYMENT_GPT_4O,
        DEFAULT_AZURE_GPT_4O_DEPLOYMENT,
      ),
    );
  }

  cfg.workspaceId = await ask(
    "Workspace ID",
    pick(saved, "workspaceId", process.env.WORKSPACE_ID, "workspace_local"),
  );
  cfg.authToken = await ask(
    "Auth bearer token",
    pick(saved, "authToken", process.env.AUTH_TOKEN, "local-compose-token"),
  );
  cfg.backendPort = readPort(
    await ask(
      "Backend port (internal service)",
      pick(saved, "backendPort", process.env.BACKEND_PORT, String(DEFAULT_BACKEND_PORT)),
    ),
    DEFAULT_BACKEND_PORT,
    "backend port",
  );

  cfg.widgetPort = readPort(
    await ask(
      "Widget iframe target port",
      pick(
        saved,
        "widgetPort",
        readEnvValue("SIDECHAT_WIDGET_PORT", "WIDGET_PORT"),
        String(DEFAULT_WIDGET_PORT),
      ),
    ),
    DEFAULT_WIDGET_PORT,
    "widget port",
  );
  if (cfg.widgetPort === DEFAULT_WORKBENCH_PORT) {
    warnLauncher(
      `Port ${DEFAULT_WORKBENCH_PORT} is usually your own app's port; using ${DEFAULT_WIDGET_PORT} for the widget instead.`,
    );
    cfg.widgetPort = DEFAULT_WIDGET_PORT;
  }
  if (cfg.backendPort === cfg.widgetPort) {
    const fallbackBackendPort =
      cfg.widgetPort === DEFAULT_BACKEND_PORT ? DEFAULT_BACKEND_PORT + 1 : DEFAULT_BACKEND_PORT;
    warnLauncher(
      `Backend port ${cfg.backendPort} clashes with the widget; using ${fallbackBackendPort} for the backend instead.`,
    );
    cfg.backendPort = fallbackBackendPort;
  }

  cfg.widgetEndpointName = await ask(
    "Widget endpoint name",
    pick(
      saved,
      "widgetEndpointName",
      readEnvValue("SIDECHAT_WIDGET_ENDPOINT_NAME", "WIDGET_ENDPOINT_NAME"),
      DEFAULT_WIDGET_ENDPOINT_NAME,
    ),
  );
  cfg.widgetBindHost = await ask(
    "Widget bind host",
    pick(saved, "widgetBindHost", process.env.SIDECHAT_WIDGET_BIND_HOST, DEFAULT_WIDGET_BIND_HOST),
  );
  cfg.widgetFramePath = normalizeFramePath(
    await ask(
      "Workbench frame proxy path",
      pick(
        saved,
        "widgetFramePath",
        process.env.SIDECHAT_WIDGET_FRAME_PATH,
        DEFAULT_WIDGET_FRAME_PATH,
      ),
    ),
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
    SIDECHAT_WORKSPACE_ID: cfg.workspaceId,
  };
  if (cfg.provider === "fake") {
    delete process.env.SIDECHAT_DATABASE_URL; // keep memory persistence
    backendEnv.SIDECHAT_DEMO_SEED_CONVERSATIONS =
      process.env.SIDECHAT_DEMO_SEED_CONVERSATIONS ?? "true";
    backendEnv.SIDECHAT_ENABLE_DEV_TOOLS = process.env.SIDECHAT_ENABLE_DEV_TOOLS ?? "true";
    logLauncher("Provider: fake showcase model with local mock tools.");
  } else if (cfg.provider === "azure") {
    // Boot the standalone Azure config; its development profile + no database URL
    // selects in-memory ("fake db") persistence, same as fake mode.
    delete process.env.SIDECHAT_DATABASE_URL;
    backendEnv.SIDECHAT_CONFIG_PATH = AZURE_CONFIG_PATH;
    backendEnv.SIDECHAT_AZURE_OPENAI_API_KEY = cfg.azureApiKey;
    backendEnv.SIDECHAT_AZURE_OPENAI_ENDPOINT = cfg.azureEndpoint;
    backendEnv.SIDECHAT_AZURE_OPENAI_API_VERSION = cfg.azureApiVersion;
    backendEnv.SIDECHAT_AZURE_DEPLOYMENT_GPT_4O = cfg.azureDeploymentGpt4o;
    logLauncher(
      `Provider: azure gpt-4o (deployment "${cfg.azureDeploymentGpt4o}") via sidechat.azure.config.ts. Persistence: in-memory.`,
    );
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
  spawnDevServer({
    name: "backend",
    labelColor: "cyan",
    workspace: BACKEND_WORKSPACE,
    env: backendEnv,
  });

  const healthy = await waitForHealth(cfg.backendPort);
  if (!healthy) {
    errLauncher("Backend did not become healthy in time. Aborting.");
    shutdown(1);
    return;
  }

  // ---- Widget iframe app exposure ----
  const publicHost = deriveWidgetPublicHost(cfg.widgetEndpointName, cfg.widgetPort);
  const widgetFrameBasePath = frameBasePath(cfg.widgetFramePath);
  const widgetEnv = {
    SIDECHAT_WIDGET_HARNESS_API_TARGET: `http://127.0.0.1:${cfg.backendPort}`,
    SIDECHAT_WIDGET_HARNESS_BASE_PATH: widgetFrameBasePath,
  };
  if (publicHost) widgetEnv.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = publicHost;

  freePort(cfg.widgetPort, "widget");
  spawnDevServer({
    name: "widget",
    labelColor: "blue",
    workspace: WIDGET_WORKSPACE,
    env: widgetEnv,
    extraArgs: ["--host", cfg.widgetBindHost, "--port", String(cfg.widgetPort), "--strictPort"],
  });

  const widgetBase = publicHost ? `https://${publicHost}` : `http://127.0.0.1:${cfg.widgetPort}`;
  const widgetUrl =
    `${widgetBase}${widgetFrameBasePath}?mode=local-service` +
    `&authToken=${encodeURIComponent(cfg.authToken)}` +
    `&workspaceId=${encodeURIComponent(cfg.workspaceId)}` +
    `&apiBaseUrl=${encodeURIComponent("/side-chat-api")}`;
  // The src YOUR host page sets on the iframe: a relative path so it resolves on
  // your app's origin, which proxies the frame path and /side-chat-api.
  const embedFrameSrc =
    `${widgetFrameBasePath}?mode=local-service` +
    `&workspaceId=${encodeURIComponent(cfg.workspaceId)}` +
    `&authToken=${encodeURIComponent(cfg.authToken)}` +
    `&apiBaseUrl=${encodeURIComponent("/side-chat-api")}` +
    `&openControl=host&open=false`;

  setTimeout(() => {
    if (shuttingDown) return;
    const line = "=".repeat(72);
    console.log("\n" + color("green", line));
    console.log(color("bold", `  Side-chat local servers (${cfg.provider} provider) are ready`));
    console.log(color("green", line));
    console.log(`  Backend (API + healthz): ${color("cyan", `http://127.0.0.1:${cfg.backendPort}`)}`);
    console.log(
      `  Widget dev server:       ${color("cyan", `http://127.0.0.1:${cfg.widgetPort}${widgetFrameBasePath}`)}`,
    );
    if (publicHost) console.log(`  Widget public host:      ${color("dim", publicHost)}`);
    console.log(`  Bearer token:            ${color("dim", cfg.authToken)}`);
    console.log("");
    console.log(`  ${color("bold", "Your app is the host. Add these to its dev proxy:")}`);
    console.log(
      `  ${color("yellow", `${cfg.widgetFramePath}  ->  http://127.0.0.1:${cfg.widgetPort}`)}  ${color("dim", "(forward as-is, ws: true)")}`,
    );
    console.log(
      `  ${color("yellow", `/side-chat-api      ->  http://127.0.0.1:${cfg.backendPort}`)}  ${color("dim", "(strip the prefix)")}`,
    );
    console.log("");
    console.log(`  ${color("bold", "Then embed the iframe on your page with this src:")}`);
    console.log(`  ${color("yellow", embedFrameSrc)}`);
    console.log(`  ${color("dim", "Full guide: docs/operations/embed-widget-iframe.md")}`);
    console.log("");
    console.log(`  ${color("bold", "Direct widget URL (debug only):")}`);
    console.log(`  ${color("yellow", widgetUrl)}`);
    if (cfg.provider === "fake") {
      console.log("");
      console.log(`  ${color("bold", "Demo prompts:")}`);
      console.log(`  ${color("yellow", "hello")}  ${color("dim", "markdown + slow streaming")}`);
      console.log(
        `  ${color("yellow", "tool")}   ${color("dim", "thinking + mock_web_search + markdown")}`,
      );
    }
    console.log(color("green", line));
    console.log(color("dim", "  Press Ctrl+C to stop the local servers."));
    console.log(color("green", line) + "\n");
  }, 2500);
}

main().catch((e) => {
  errLauncher(e?.stack || String(e));
  shutdown(1);
});
