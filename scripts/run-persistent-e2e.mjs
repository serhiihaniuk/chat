import { spawn } from "node:child_process";
import { resolve } from "node:path";

import {
  applySidechatMigrations,
  startPostgresTestContainer,
} from "./lib/postgres-testcontainer.mjs";

const servicePort = 3102;
const widgetPort = 5175;
const serviceBaseUrl = `http://127.0.0.1:${servicePort}`;
const widgetBaseUrl = `http://127.0.0.1:${widgetPort}`;
const authToken = "persistent-e2e-token";
const workspaceId = "workspace_persistent_e2e";
const repoRoot = resolve(import.meta.dirname, "..");

const run = async () => {
  const postgres = await startPostgresTestContainer();
  const children = [];

  try {
    console.log("Applying migrations for persistent E2E Postgres...");
    await applySidechatMigrations(postgres.connectionString);
    console.log("Starting partner-ai-service against Testcontainers Postgres...");
    const service = spawnProcess(
      "npm",
      ["--workspace", "@side-chat/partner-ai-service", "run", "dev"],
      {
        PORT: String(servicePort),
        SIDECHAT_ALLOWED_MODELS: "",
        SIDECHAT_AUTH_BEARER_TOKEN: authToken,
        SIDECHAT_DATABASE_URL: postgres.connectionString,
        SIDECHAT_ENABLE_DEV_TOOLS: "true",
        SIDECHAT_HISTORY_MODE: "recent_messages",
        SIDECHAT_OPENAI_API_KEY: "",
        SIDECHAT_POLICY_MODE: "allow_all",
        SIDECHAT_PROFILE: "development",
        SIDECHAT_PROVIDER: "fake",
        SIDECHAT_TENANT_ID: "tenant_persistent_e2e",
        SIDECHAT_WORKSPACE_ID: workspaceId,
      },
    );
    children.push(service);
    await waitForUrl(`${serviceBaseUrl}/healthz`);
    console.log(`partner-ai-service is healthy at ${serviceBaseUrl}.`);

    console.log("Starting widget harness for persistent E2E...");
    const widget = spawnProcess(
      "npm",
      [
        "--workspace",
        "@side-chat/widget-harness",
        "run",
        "dev",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        String(widgetPort),
      ],
      {
        SIDECHAT_WIDGET_HARNESS_API_TARGET: serviceBaseUrl,
      },
    );
    children.push(widget);
    await waitForUrl(widgetBaseUrl);
    console.log(`widget harness is ready at ${widgetBaseUrl}.`);

    console.log("Running persistent Playwright specs...");
    await spawnCommand(
      "node",
      ["node_modules/playwright/cli.js", "test", "--config", "playwright.persistent.config.ts"],
      {
        SIDECHAT_PERSISTENT_AUTH_TOKEN: authToken,
        SIDECHAT_PERSISTENT_SERVICE_URL: serviceBaseUrl,
        SIDECHAT_PERSISTENT_WIDGET_URL: widgetBaseUrl,
        SIDECHAT_PERSISTENT_WORKSPACE_ID: workspaceId,
      },
    );
  } finally {
    for (const child of children.toReversed()) {
      await killProcessTree(child);
    }
    await postgres.stop();
  }
};

const spawnProcess = (command, args, extraEnv) =>
  spawn(resolveCommand(command), resolveArgs(command, args), {
    cwd: repoRoot,
    detached: process.platform !== "win32",
    env: cleanEnv({ ...process.env, ...extraEnv }),
    shell: false,
    stdio: "inherit",
  });

const resolveCommand = (command) =>
  process.platform === "win32" && command === "npm" ? "cmd.exe" : command;

const resolveArgs = (command, args) =>
  process.platform === "win32" && command === "npm" ? ["/d", "/s", "/c", "npm", ...args] : args;

const cleanEnv = (env) =>
  Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) => key.length > 0 && !key.startsWith("=") && value !== undefined,
    ),
  );

const spawnCommand = (command, args, extraEnv) =>
  new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, extraEnv);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? "unknown"}`));
    });
  });

const killProcessTree = (child) =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    if (process.platform === "win32") {
      if (child.pid === undefined) {
        resolve();
        return;
      }
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
      return;
    }
    try {
      if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    child.once("exit", () => resolve());
    setTimeout(() => resolve(), 2_000).unref();
  });

const waitForUrl = async (url) => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling until the process exposes its health endpoint.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

await run();
