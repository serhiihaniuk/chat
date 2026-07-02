import { resolve } from "node:path";
import { defineConfig } from "playwright/test";

const widgetPort = readPortEnv("SIDECHAT_E2E_WIDGET_PORT", 5174);
const hostPort = readPortEnv("SIDECHAT_E2E_HOST_PORT", 5180);
const servicePort = readPortEnv("SIDECHAT_E2E_SERVICE_PORT", 3101);
const serviceBaseUrl = `http://127.0.0.1:${servicePort}`;
const hostBaseUrl = `http://127.0.0.1:${hostPort}`;
const widgetBaseUrl = `http://127.0.0.1:${widgetPort}`;
const authToken = "local-compose-token";
const workspaceId = "workspace_e2e";

function readPortEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const port = Number(value);
  if (Number.isInteger(port) && port > 0 && port <= 65535) return port;

  throw new Error(`Invalid ${name} value: ${value}`);
}

export default defineConfig({
  testDir: "test-harness/widget-harness/e2e",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/persistent.spec.ts",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: hostBaseUrl,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm --workspace @side-chat/partner-ai-service run dev",
      env: {
        PORT: String(servicePort),
        SIDECHAT_AUTH_BEARER_TOKEN: authToken,
        // The no-secrets fake-provider config: deterministic model, in-memory
        // persistence, mock tools — the browser suite needs no API key. Absolute,
        // because the webServer child resolves relative paths from its own cwd.
        SIDECHAT_CONFIG_PATH: resolve(
          import.meta.dirname,
          "apps/partner-ai-service/sidechat.fake.config.ts",
        ),
        SIDECHAT_DATABASE_URL: "",
        SIDECHAT_DEMO_SEED_CONVERSATIONS: "true",
        SIDECHAT_PROFILE: "development",
        SIDECHAT_TENANT_ID: "tenant_e2e",
        SIDECHAT_WORKSPACE_ID: workspaceId,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${serviceBaseUrl}/healthz`,
    },
    {
      command: `npm --workspace @side-chat/widget-harness run dev -- --host 127.0.0.1 --port ${widgetPort}`,
      env: {
        SIDECHAT_WIDGET_HARNESS_BASE_PATH: "/side-chat-frame/",
        SIDECHAT_WIDGET_HARNESS_API_TARGET: serviceBaseUrl,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: widgetBaseUrl,
    },
    {
      command: `npm --workspace @side-chat/widget-harness run dev -- --config vite.host.config.ts --host 127.0.0.1 --port ${hostPort} --strictPort`,
      env: {
        SIDECHAT_WIDGET_HOST_API_TARGET: serviceBaseUrl,
        SIDECHAT_WIDGET_HOST_FRAME_PATH: "/side-chat-frame",
        SIDECHAT_WIDGET_HOST_UI_TARGET: widgetBaseUrl,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${hostBaseUrl}/workbench-embed.html`,
    },
  ],
  metadata: {
    authToken,
    hostBaseUrl,
    serviceBaseUrl,
    workspaceId,
  },
});
