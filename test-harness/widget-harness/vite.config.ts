import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env["SIDECHAT_WIDGET_HARNESS_API_TARGET"] ?? "http://127.0.0.1:8787";
const base = normalizeViteBase(process.env["SIDECHAT_WIDGET_HARNESS_BASE_PATH"] ?? "/");
const cacheDir =
  process.env["SIDECHAT_WIDGET_HARNESS_CACHE"] === "compiled"
    ? "node_modules/.vite-widget-ui-compiled"
    : "node_modules/.vite-widget-ui";
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
  // Playwright starts this UI server beside the host proxy. Give each process
  // its own optimizer cache so one Vite generation cannot invalidate the
  // other's dependency URLs and surface an "Outdated Optimize Dep" 504.
  cacheDir,
  plugins: [react(), tailwindcss()],
  // Serve streamdown as raw ESM instead of pre-bundling it: its lazily-imported
  // highlighting chunk otherwise gets a dep-optimizer generation hash that goes
  // stale when the optimizer reruns mid-session ("Outdated Optimize Dep" 504 on
  // the first rendered code block), which fails the e2e no-page-errors gate.
  // Nested CJS deps of the excluded package still need interop bundling; this is
  // the full runtime-CJS closure of streamdown@2.5.0 (types-only and mermaid-only
  // subtrees excluded — the harness never renders mermaid).
  optimizeDeps: {
    exclude: ["streamdown"],
    include: [
      "streamdown > hast-util-to-jsx-runtime > style-to-js",
      "streamdown > hast-util-to-jsx-runtime > mdast-util-mdx-expression > mdast-util-from-markdown > micromark > debug",
      "streamdown > hast-util-to-jsx-runtime > mdast-util-mdx-expression > mdast-util-from-markdown > micromark > debug > ms",
      "streamdown > remark-gfm > remark-parse > unified > extend",
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": createApiProxy(/^\/api/u),
      "/side-chat-api": createApiProxy(/^\/side-chat-api/u),
    },
  },
});
