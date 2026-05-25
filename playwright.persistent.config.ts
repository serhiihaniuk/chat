import { defineConfig } from "playwright/test";

const widgetBaseUrl = process.env["SIDECHAT_PERSISTENT_WIDGET_URL"] ?? "http://127.0.0.1:5175";

export default defineConfig({
  testDir: "test-harness/widget-harness/e2e",
  testMatch: "persistent.spec.ts",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: widgetBaseUrl,
    trace: "on-first-retry",
  },
});
