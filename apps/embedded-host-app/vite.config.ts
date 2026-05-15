import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const sideChatApi = process.env.SIDE_CHAT_API_PROXY_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/chat/stream": sideChatApi,
      "/chat/history": sideChatApi,
      "/chat/usage": sideChatApi,
      "/health": sideChatApi,
      "/models": sideChatApi,
      "/advisory-dashboard": "http://127.0.0.1:3100",
      "/dashboard-health": "http://127.0.0.1:3100",
    },
  },
});
