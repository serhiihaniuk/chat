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
| Host page  | `http://127.0.0.1:8080` | Local Workbench-style page that proxies UI and API.       |

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

For local runs, the launcher prints an embedded host page served from the local
host origin at `workbench-embed.html`. Open that page first; it owns the visible
open/close button, proxies `/side-chat-frame` to the widget UI, proxies
`/side-chat-api` to the service, and embeds the Side Chat iframe. The raw iframe
app URL is useful only for debugging the frame contents directly.

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
the proxy. Because the iframe app is already served with that base path, forward
the `/side-chat-frame` prefix to the widget target unchanged. Strip only the API
proxy prefix before forwarding to the backend service root.

The widget harness also has a local host config at
`test-harness/widget-harness/vite.host.config.ts` for the no-Docker launcher and
browser tests. That host config is intentionally separate from the widget
iframe-app config: the host config owns both proxies, while the widget config is
only the proxy target.

## Iframe Markup

The host app embeds the same-origin Workbench path:

```html
<button id="side-chat-toggle" type="button" aria-controls="side-chat-frame" aria-expanded="false">
  Open assistant
</button>
<iframe
  id="side-chat-frame"
  title="Workspace Assistant"
  src="/side-chat-frame/?mode=local-service&workspaceId=<workspace-id>&authToken=<local-token>&apiBaseUrl=/side-chat-api&openControl=host&open=false"
  allow="clipboard-write"
  referrerpolicy="strict-origin-when-cross-origin"
  hidden
></iframe>
```

Dock the host button in the bottom-right corner, outside the iframe, and place
the iframe above it:

```css
#side-chat-toggle {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 20;
}

#side-chat-frame {
  position: fixed;
  right: 16px;
  bottom: 64px;
  z-index: 10;
  width: min(1200px, calc(100vw - 32px));
  height: min(90vh, calc(100vh - 80px));
  min-height: min(620px, calc(100vh - 80px));
  border: 0;
}

#side-chat-frame[hidden] {
  display: none;
}
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
  if (frame) frame.hidden = !open;
  if (button) {
    button.textContent = open ? "Close assistant" : "Open assistant";
    button.setAttribute("aria-expanded", String(open));
  }
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

## Resize Boundary

Side Chat's resize handles resize the widget panel **inside** the iframe. They
do not resize the host iframe element. The host page must give the iframe a
large fixed viewport, such as the bottom-right dock above, because iframe
contents cannot draw outside the iframe's rectangle.

If the widget appears not to resize in a host app, check the host CSS first:

- Do not size the iframe to the closed launcher or to the current panel content.
- Do not put the iframe inside a small `overflow: hidden` container.
- Do not apply `pointer-events: none`, transforms, or scaling to the iframe.
- Keep the iframe visible while open; hide it only when the host state is closed.
- If the host wants the outer iframe itself to be user-resizable, implement that
  as host-page behavior separately from the Side Chat panel resize handles.

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
