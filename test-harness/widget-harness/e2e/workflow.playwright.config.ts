import { defineConfig } from "playwright/test";

const widgetPort = 5175;
const widgetBaseUrl = `http://127.0.0.1:${widgetPort}`;
const workflowFixturePort = 8788;
const workflowFixtureUrl = `http://127.0.0.1:${workflowFixturePort}`;

/** Browser proof for the native Workflow branch without the legacy service stack. */
export default defineConfig({
  testDir: ".",
  testMatch: [
    "workflow-interactions.spec.ts",
    "workflow-look-parity.spec.ts",
    "workflow-multitab.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: widgetBaseUrl,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node workflow-multitab-test-service.ts",
      reuseExistingServer: false,
      timeout: 30_000,
      url: `${workflowFixtureUrl}/__test/health`,
    },
    {
      command: `npm --workspace @side-chat/widget-harness run dev -- --host 127.0.0.1 --port ${widgetPort} --strictPort`,
      env: {
        SIDECHAT_WIDGET_HARNESS_API_TARGET: workflowFixtureUrl,
        SIDECHAT_WIDGET_HARNESS_BASE_PATH: "/side-chat-frame/",
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${widgetBaseUrl}/side-chat-frame/`,
    },
  ],
});
