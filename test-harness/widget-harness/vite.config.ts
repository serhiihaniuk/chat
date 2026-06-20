import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env["SIDECHAT_WIDGET_HARNESS_API_TARGET"] ?? "http://127.0.0.1:8787";
const base = normalizeViteBase(process.env["SIDECHAT_WIDGET_HARNESS_BASE_PATH"] ?? "/");
// This Vite server is the iframe UI target. The host/workbench proxy that
// exposes both /side-chat-frame and /side-chat-api lives in vite.host.config.ts.
const createApiProxy = (prefix: RegExp) => ({
  target: apiTarget,
  changeOrigin: true,
  rewrite: (path: string) => path.replace(prefix, ""),
});

function normalizeViteBase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "/";

  const withoutEdges = trimmed.replace(/^\/+/u, "").replace(/\/+$/u, "");
  return `/${withoutEdges}/`;
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": createApiProxy(/^\/api/u),
      "/side-chat-api": createApiProxy(/^\/side-chat-api/u),
    },
  },
});
