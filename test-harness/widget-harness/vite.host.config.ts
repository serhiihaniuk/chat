import { defineConfig } from "vite";

const apiTarget = process.env["SIDECHAT_WIDGET_HOST_API_TARGET"] ?? "http://127.0.0.1:8787";
const uiTarget = process.env["SIDECHAT_WIDGET_HOST_UI_TARGET"] ?? "http://127.0.0.1:5174";
const framePath = normalizeProxyPath(
  process.env["SIDECHAT_WIDGET_HOST_FRAME_PATH"] ?? "/side-chat-frame",
);

const createHostProxy = ({
  prefix,
  stripPrefix = true,
  target,
  ws = false,
}: {
  readonly prefix: string;
  readonly stripPrefix?: boolean;
  readonly target: string;
  readonly ws?: boolean;
}) => ({
  target,
  changeOrigin: true,
  ws,
  rewrite: (path: string) => (stripPrefix ? stripProxyPrefix(path, prefix) : path),
});

function normalizeProxyPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "/";

  const withoutEdges = trimmed.replace(/^\/+/u, "").replace(/\/+$/u, "");
  return `/${withoutEdges}`;
}

function stripProxyPrefix(path: string, prefix: string): string {
  if (prefix === "/") return path;

  const stripped = path.replace(new RegExp(`^${escapeRegExp(prefix)}`, "u"), "");
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export default defineConfig({
  // The Playwright suite runs this proxy and the widget UI concurrently from
  // one workspace. Separate caches keep their dependency optimizers isolated.
  cacheDir: "node_modules/.vite-widget-host",
  publicDir: "public",
  // The host entry is transformed TypeScript so the iframe fixture exercises
  // the exported registration API instead of maintaining a handwritten copy.
  root: ".",
  server: {
    host: "127.0.0.1",
    port: 8080,
    proxy: {
      [framePath]: createHostProxy({
        prefix: framePath,
        stripPrefix: false,
        target: uiTarget,
        ws: true,
      }),
      "/side-chat-api": createHostProxy({
        prefix: "/side-chat-api",
        target: apiTarget,
      }),
    },
  },
});
