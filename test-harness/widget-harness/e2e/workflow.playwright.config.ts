import { defineConfig } from "playwright/test";

const widgetPort = readPort("SIDECHAT_WORKFLOW_WIDGET_PORT", 5175);
const widgetBaseUrl = `http://127.0.0.1:${widgetPort}`;
const hostPort = readPort("SIDECHAT_WORKFLOW_HOST_PORT", 5181);
const hostBaseUrl = `http://127.0.0.1:${hostPort}`;
const workflowFixturePort = readPort("SIDECHAT_WORKFLOW_FIXTURE_PORT", 8788);
const workflowFixtureUrl = `http://127.0.0.1:${workflowFixturePort}`;
const compiledServicePort = readPort("SIDECHAT_COMPILED_SERVICE_PORT", 8790);
const compiledServiceUrl = `http://127.0.0.1:${compiledServicePort}`;
const compiledWidgetPort = readPort("SIDECHAT_COMPILED_WIDGET_PORT", 5176);
const compiledWidgetUrl = `http://127.0.0.1:${compiledWidgetPort}`;

/** Browser verification across the fixture service, iframe host, and compiled service seams. */
export default defineConfig({
  testDir: ".",
  testMatch: [
    "workflow-interactions.spec.ts",
    "workflow-iframe.spec.ts",
    "workflow-multitab.spec.ts",
    "workflow-compiled-service.spec.ts",
  ],
  // All projects share fixed ports and process-global fixture state; serial
  // execution keeps resets and lifecycle assertions isolated.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: widgetBaseUrl,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node ../../../scripts/run-compiled-fake-test-service.mjs",
      env: {
        PORT: String(compiledServicePort),
      },
      reuseExistingServer: false,
      timeout: 300_000,
      url: `${compiledServiceUrl}/healthz`,
    },
    {
      command: "node workflow-multitab-test-service.ts",
      env: {
        SIDECHAT_WORKFLOW_FIXTURE_PORT: String(workflowFixturePort),
      },
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
    {
      command: `npm --workspace @side-chat/widget-harness run dev -- --config vite.host.config.ts --host 127.0.0.1 --port ${hostPort} --strictPort`,
      env: {
        SIDECHAT_WIDGET_HOST_API_TARGET: workflowFixtureUrl,
        SIDECHAT_WIDGET_HOST_FRAME_PATH: "/side-chat-frame",
        SIDECHAT_WIDGET_HOST_UI_TARGET: widgetBaseUrl,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${hostBaseUrl}/workbench-embed.html`,
    },
    {
      command: `npm --workspace @side-chat/widget-harness run dev -- --host 127.0.0.1 --port ${compiledWidgetPort} --strictPort`,
      env: {
        SIDECHAT_WIDGET_HARNESS_API_TARGET: compiledServiceUrl,
        SIDECHAT_WIDGET_HARNESS_BASE_PATH: "/compiled-side-chat/",
        SIDECHAT_WIDGET_HARNESS_CACHE: "compiled",
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${compiledWidgetUrl}/compiled-side-chat/`,
    },
  ],
});

function readPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
