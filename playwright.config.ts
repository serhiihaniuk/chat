import { defineConfig } from "playwright/test";

const widgetPort = readPortEnv("SIDECHAT_E2E_WIDGET_PORT", 5174);
const servicePort = readPortEnv("SIDECHAT_E2E_SERVICE_PORT", 3101);
const serviceBaseUrl = `http://127.0.0.1:${servicePort}`;
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
    baseURL: widgetBaseUrl,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm --workspace @side-chat/partner-ai-service run dev",
      env: {
        PORT: String(servicePort),
        SIDECHAT_ALLOWED_MODELS: "",
        SIDECHAT_AUTH_BEARER_TOKEN: authToken,
        SIDECHAT_DATABASE_URL: "",
        SIDECHAT_ENABLE_DEV_TOOLS: "true",
        SIDECHAT_OPENAI_API_KEY: "",
        SIDECHAT_POLICY_MODE: "allow_all",
        SIDECHAT_PROFILE: "development",
        SIDECHAT_PROVIDER: "fake",
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
  ],
  metadata: {
    authToken,
    serviceBaseUrl,
    workspaceId,
  },
});
