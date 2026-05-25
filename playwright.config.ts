import { defineConfig } from "playwright/test";

const widgetPort = 5174;
const servicePort = 3101;
const serviceBaseUrl = `http://127.0.0.1:${servicePort}`;
const widgetBaseUrl = `http://127.0.0.1:${widgetPort}`;
const authToken = "local-compose-token";
const workspaceId = "workspace_e2e";

export default defineConfig({
  testDir: "test-harness/widget-harness/e2e",
  testMatch: "**/*.spec.ts",
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
