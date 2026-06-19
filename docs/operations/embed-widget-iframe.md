# Embed Widget In An Iframe

Read this when: a host app needs to embed Side Chat as an iframe.
Source of truth for: local no-Docker iframe wiring and Workbench port rules.
Not source of truth for: production host deployment or domain-specific auth.

Side Chat owns the iframe app, widget, browser protocol, and service API. The
host app owns the page that places the iframe, host auth, business UI, and any
host-specific permissions.

## Local No-Docker Stack

Use the local launcher when the environment has no Docker or Postgres. It starts
the service with in-memory persistence and starts the widget harness as the
iframe app.

```powershell
node scripts/run-local-fake.mjs --yes
```

Keep the real Workbench on port `8080`. The Side Chat iframe app must use a
different port; the launcher defaults to `5174` and refuses `8080`.

The launcher exposes:

| Process    | Default                 | Role                                                      |
| ---------- | ----------------------- | --------------------------------------------------------- |
| Service    | `http://127.0.0.1:8787` | Hono API, fake or OpenAI provider, in-memory persistence. |
| Iframe app | `http://127.0.0.1:5174` | Vite widget harness that renders `SideChatWidget`.        |
| Workbench  | `http://127.0.0.1:8080` | Real host app that owns the embedding page.               |

When `SIDECHAT_PROVIDER=fake`, the launcher sets
`SIDECHAT_DEMO_SEED_CONVERSATIONS=true` and `SIDECHAT_ENABLE_DEV_TOOLS=true` by
default. The service preloads a few in-memory showcase chats through the normal
persistence repositories, and exposes the deterministic `mock_web_search` tool,
so the conversation list, activity panel, and history routes look populated
during a demo. Set `SIDECHAT_DEMO_SEED_CONVERSATIONS=false` before launching to
start empty.

For the fake demo, send `hello` to show slow markdown streaming and send `tool`
to show thinking, `mock_web_search` activity, source details, and a markdown
final answer. Both prompts still use the normal core, AI runtime, service, and
widget paths.

The browser should load Side Chat through the Workbench origin. The widget
process is only the proxy target.

## Workbench Proxy

Configure the real Workbench Vite app to proxy both the iframe app and the
service API:

```ts
// workbench vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      "/side-chat-frame": {
        target: "http://127.0.0.1:5174",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/side-chat-frame/u, ""),
      },
      "/side-chat-api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/side-chat-api/u, ""),
      },
    },
  },
});
```

The launcher sets `SIDECHAT_WIDGET_HARNESS_BASE_PATH=/side-chat-frame/` for the
widget Vite app. Keep that base path aligned with the Workbench
`/side-chat-frame` proxy path, otherwise Vite module and asset URLs will escape
the proxy.

## Iframe Markup

The host app embeds the same-origin Workbench path:

```html
<button id="side-chat-toggle" type="button">Open assistant</button>
<iframe
  title="Workspace Assistant"
  src="/side-chat-frame/?mode=local-service&workspaceId=<workspace-id>&authToken=<local-token>&apiBaseUrl=/side-chat-api&openControl=host&open=false"
  style="width: 100%; height: 100%; border: 0"
  allow="clipboard-write"
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
```

The host owns the visible open/closed state. Send `sidechat.widget.setOpen` to
the iframe whenever the host button changes state, and listen for
`sidechat.widget.openChange` when Side Chat chrome requests a close:

```ts
const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Workspace Assistant"]');
const button = document.querySelector<HTMLButtonElement>("#side-chat-toggle");
let open = false;

const sendOpenState = () => {
  frame?.contentWindow?.postMessage(
    { type: "sidechat.widget.setOpen", open },
    window.location.origin,
  );
  if (button) button.textContent = open ? "Close assistant" : "Open assistant";
};

button?.addEventListener("click", () => {
  open = !open;
  sendOpenState();
});

frame?.addEventListener("load", sendOpenState);
window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type !== "sidechat.widget.openChange") return;
  open = event.data.open;
  sendOpenState();
});
```

For the local harness, `authToken` is the bearer token configured in the
launcher. Do not use query-string tokens as a production auth design; production
hosts should mint a short-lived frame session or rely on the host's own auth
boundary.

## Verification

Run the browser lane before handing the integration to a host app:

```sh
npm run test:e2e
```

If a live local app is already using the default E2E ports, run the browser lane
on alternate ports:

```powershell
$env:SIDECHAT_E2E_WIDGET_PORT = "5184"
$env:SIDECHAT_E2E_SERVICE_PORT = "3102"
npm run test:e2e
```

The Playwright harness starts the service with the fake provider and memory
persistence, then verifies both the direct widget page and an iframe-hosted page.
