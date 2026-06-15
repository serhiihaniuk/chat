import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { Pool } from "pg";
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
const serviceEnv = (connectionString) => ({
  PORT: String(servicePort),
  SIDECHAT_ALLOWED_MODELS: "",
  SIDECHAT_AUTH_BEARER_TOKEN: authToken,
  SIDECHAT_DATABASE_URL: connectionString,
  SIDECHAT_ENABLE_DEV_TOOLS: "true",
  SIDECHAT_HISTORY_MODE: "recent_messages",
  SIDECHAT_OPENAI_API_KEY: "",
  SIDECHAT_POLICY_MODE: "allow_all",
  SIDECHAT_PROFILE: "development",
  SIDECHAT_PROVIDER: "fake",
  SIDECHAT_TENANT_ID: "tenant_persistent_e2e",
  SIDECHAT_WORKSPACE_ID: workspaceId,
});

const run = async () => {
  const postgres = await startPostgresTestContainer();
  const children = [];

  try {
    console.log("Applying migrations for persistent E2E Postgres...");
    await applySidechatMigrations(postgres.connectionString);
    console.log("Starting partner-ai-service against Testcontainers Postgres...");
    let service = startPersistentService(postgres.connectionString);
    children.push(service);
    await waitForUrl(`${serviceBaseUrl}/healthz`);
    console.log(`partner-ai-service is healthy at ${serviceBaseUrl}.`);
    service = await verifyServiceRestartPersistence({
      connectionString: postgres.connectionString,
      currentService: service,
      children,
    });

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

const startPersistentService = (connectionString) =>
  spawnProcess(
    "npm",
    ["--workspace", "@side-chat/partner-ai-service", "run", "dev"],
    serviceEnv(connectionString),
  );

const verifyServiceRestartPersistence = async ({ connectionString, currentService, children }) => {
  console.log("Verifying service history survives a restart...");
  await expectPersistentHealth();
  const expectedHistory = ["Persistent restart smoke", "Fake response: Persistent restart smoke"];
  const streamBody = await postStream({
    requestId: "request_persistent_restart_smoke",
    messageId: "message_persistent_restart_smoke",
    content: expectedHistory[0],
  });
  const conversationId = readConversationId(streamBody);
  await expectHistory(conversationId, expectedHistory);
  await expectTableCountAtLeast(connectionString, "sidechat.messages", 2);
  await expectTableCountAtLeast(connectionString, "sidechat.assistant_turns", 1);
  await expectTableCountAtLeast(connectionString, "sidechat.turn_context_snapshots", 1);

  await killProcessTree(currentService);
  const restartedService = startPersistentService(connectionString);
  children.push(restartedService);
  await waitForUrl(`${serviceBaseUrl}/healthz`);
  await expectPersistentHealth();
  await expectHistory(conversationId, expectedHistory);

  await resetConversation(conversationId);
  await expectHistory(conversationId, []);
  return restartedService;
};

const expectPersistentHealth = async () => {
  const response = await fetch(`${serviceBaseUrl}/healthz`);
  if (!response.ok) throw new Error(`Expected healthy service, got ${response.status}.`);
  const health = await response.json();
  if (health.persistence !== "postgres-drizzle") {
    throw new Error(`Expected postgres-drizzle persistence, got ${health.persistence}.`);
  }
};

const postStream = async ({ requestId, messageId, content }) => {
  const response = await fetch(`${serviceBaseUrl}/chat/stream`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      protocolVersion: "sidechat.v1",
      requestId,
      message: { id: messageId, role: "user", content },
      hostContext: {
        schemaVersion: "host.v1",
        origin: "https://persistent-e2e.example",
      },
    }),
  });
  if (!response.ok) throw new Error(`Persistent stream smoke failed with ${response.status}.`);
  return response.text();
};

const expectHistory = async (conversationId, expectedMessages) => {
  const response = await fetch(`${serviceBaseUrl}/chat/history/${conversationId}`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`History read failed with ${response.status}.`);
  const history = await response.json();
  const messages = history.messages.map((message) => message.content);
  if (JSON.stringify(messages) !== JSON.stringify(expectedMessages)) {
    throw new Error(
      `Expected history ${JSON.stringify(expectedMessages)}, got ${JSON.stringify(messages)}.`,
    );
  }
};

const resetConversation = async (conversationId) => {
  const response = await fetch(`${serviceBaseUrl}/chat/history/${conversationId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`History reset failed with ${response.status}.`);
};

const expectTableCountAtLeast = async (connectionString, tableName, minimumCount) => {
  const pool = new Pool({ connectionString });
  try {
    const result = await pool.query(`SELECT count(*)::int AS count FROM ${tableName}`);
    const count = Number(result.rows[0]?.count ?? 0);
    if (count < minimumCount) {
      throw new Error(
        `Expected ${tableName} to contain at least ${minimumCount} rows, got ${count}.`,
      );
    }
  } finally {
    await pool.end();
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

const readConversationId = (body) => {
  const match = /"conversationId":"([^"]+)"/u.exec(body);
  if (!match?.[1]) throw new Error("Expected stream to include a conversation id.");
  return match[1];
};

const authHeaders = () => ({
  authorization: `Bearer ${authToken}`,
});

await run();
