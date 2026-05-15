import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:5173" },
  webServer: [
    {
      command: "npm run --workspace @side-chat/side-chat-api dev",
      url: "http://127.0.0.1:3000/health",
      reuseExistingServer: true,
    },
    {
      command: "npm run dev --workspace @side-chat/embedded-host-app",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
    },
    {
      command:
        "npm run --workspace @side-chat/widget-demo dev -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
    },
  ],
});
