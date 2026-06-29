# Embed The Widget In Your App

Read this when: you embed Side Chat into your own web app (the host) behind a dev proxy.
Source of truth for: running the local servers for embedding, the dev proxy your app adds, the iframe markup, and the open/close handshake.
Not source of truth for: the launcher's provider/database options (see [local-development.md](local-development.md)); widget/host-bridge architecture (see [../architecture/widget-and-host-integration.md](../architecture/widget-and-host-integration.md)); production host deployment.

Side Chat renders as a same-origin iframe inside **your** app. Your app is the host: it owns the open/close button and the iframe element, and it proxies two path prefixes to the local Side Chat servers — `/side-chat-frame` to the widget UI and `/side-chat-api` to the backend service. The launcher starts those two servers; it does **not** start a host page, because your app is the host.

## 1. Start the local servers

```powershell
node scripts/run-local-fake.mjs
```

This starts two dev servers (provider, database, and Azure options live in [local-development.md](local-development.md)):

| Server | Default origin | Your app proxies it as |
| --- | --- | --- |
| Backend service | `http://127.0.0.1:8787` | `/side-chat-api` (strip the prefix) |
| Widget UI (Vite) | `http://127.0.0.1:5174` | `/side-chat-frame` (forward unchanged, `ws: true`) |

The launcher prints both targets, the bearer token, and a ready-to-paste iframe `src`. Leave it running while you develop your host app.

## 2. Add the proxy to your app

The widget and your app must be same-origin, so your app proxies both prefixes to the launcher's servers. For a Vite host app, add this to your `vite.config.ts`:

```ts
// vite.config.ts (your app)
export default defineConfig({
  server: {
    proxy: {
      // Widget UI — forward unchanged so its /side-chat-frame/* asset URLs resolve.
      "/side-chat-frame": {
        target: "http://127.0.0.1:5174",
        changeOrigin: true,
        ws: true,
      },
      // Backend API — strip the prefix, then forward to the service root.
      "/side-chat-api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/side-chat-api/, ""),
      },
    },
  },
});
```

Two rules keep asset URLs inside the proxy:

- **Forward `/side-chat-frame` unchanged.** The launcher serves the widget under that base path, so it emits `/side-chat-frame/...` module and asset URLs. The prefix must survive; enable `ws: true` so Vite HMR works through the proxy.
- **Strip the prefix only on `/side-chat-api`.** Keep your proxy prefix equal to the launcher's frame path (default `/side-chat-frame`).

A non-Vite host (nginx, Express, Caddy, etc.) applies the same two rules. The reference implementation is [`test-harness/widget-harness/vite.host.config.ts`](../../test-harness/widget-harness/vite.host.config.ts).

## 3. Embed the iframe

Add a toggle button and the same-origin frame to your page. The widget reads its query params in [`test-harness/widget-harness/src/config/modes.ts:29-41`](../../test-harness/widget-harness/src/config/modes.ts):

```html
<button id="side-chat-toggle" type="button" aria-controls="side-chat-frame" aria-expanded="false">
  Open assistant
</button>
<iframe
  id="side-chat-frame"
  title="Workspace Assistant"
  src="/side-chat-frame/?mode=local-service&workspaceId=<workspace-id>&authToken=<frame-token>&apiBaseUrl=/side-chat-api&openControl=host&open=false"
  allow="clipboard-write"
  referrerpolicy="strict-origin-when-cross-origin"
  hidden
></iframe>
```

Frame `src` query params:

| Param | Value | Effect |
| --- | --- | --- |
| `mode` | `local-service` | Talk to the real service through `apiBaseUrl`. |
| `apiBaseUrl` | `/side-chat-api` | Same-origin API prefix your app proxies. |
| `openControl` | `host` | Your app owns open/close; the widget defers (`modes.ts:61-64`). |
| `open` | `false` | Initial visible state. |
| `workspaceId` | host value | Scopes conversation storage. |
| `authToken` | dev bearer | Local-only; see the token note below. |

Dock the button bottom-right and place the iframe above it. The iframe must keep a large fixed viewport because its contents cannot draw outside its rectangle:

```css
#side-chat-toggle { position: fixed; right: 16px; bottom: 16px; z-index: 20; }
#side-chat-frame {
  position: fixed; right: 16px; bottom: 64px; z-index: 10;
  width: min(1200px, calc(100vw - 32px));
  height: min(90vh, calc(100vh - 80px));
  min-height: min(620px, calc(100vh - 80px));
  border: 0;
}
#side-chat-frame[hidden] { display: none; }
```

## 4. Open/close handshake

Your app owns the visible state and drives the iframe with three `postMessage` types (`harness-app.tsx:16-18`):

| Type | Direction | Meaning |
| --- | --- | --- |
| `sidechat.widget.ready` | iframe -> host | Frame mounted; resend current state. |
| `sidechat.widget.setOpen` | host -> iframe | Set open/closed to match the host button. |
| `sidechat.widget.openChange` | iframe -> host | Side Chat chrome requested a close. |

Send `setOpen` on button click, on frame `load`, and on `ready`; listen for `openChange` to follow a close from inside the widget:

```ts
const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Workspace Assistant"]');
const button = document.querySelector<HTMLButtonElement>("#side-chat-toggle");
let open = false;

const sendOpenState = () => {
  frame?.contentWindow?.postMessage({ type: "sidechat.widget.setOpen", open }, window.location.origin);
  if (frame) frame.hidden = !open;
  if (button) {
    button.textContent = open ? "Close assistant" : "Open assistant";
    button.setAttribute("aria-expanded", String(open));
  }
};

button?.addEventListener("click", () => { open = !open; sendOpenState(); });
frame?.addEventListener("load", sendOpenState);
window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === "sidechat.widget.ready") return sendOpenState();
  if (event.data?.type !== "sidechat.widget.openChange") return;
  open = event.data.open;
  sendOpenState();
});
```

`test-harness/widget-harness/public/workbench-embed.html` is a standalone reference implementation of this exact markup + handshake — copy from it if useful.

> Token note: the local `authToken` is a dev bearer (the launcher prints it; the default is `local-compose-token`). Do not ship query-string tokens. A production host mints a short-lived frame session or relies on its own auth boundary. Keep real secrets out of markup and URLs.

## Resize boundary

Side Chat's resize handles resize the panel **inside** the iframe; they never resize the host iframe element. Give the iframe a large fixed viewport (the dock above). If the panel seems stuck, check the host CSS first:

- Size the iframe to its open footprint, not to the closed launcher or current content.
- Do not nest the iframe in a small `overflow: hidden` container.
- Do not apply `pointer-events: none`, transforms, or scaling to the iframe.
- Keep the iframe visible while open; hide it only when the host state is closed.
- To make the outer iframe user-resizable, build that as host-page behavior, separate from the panel handles.

## Verify the embed

A browser lane proves both the direct widget page and an iframe-hosted page against the fake provider with memory persistence:

```sh
npm run test:e2e
```

If the default E2E ports (widget `5174`, service `3101`; `playwright.config.ts:3,5`) are busy, override them:

```powershell
$env:SIDECHAT_E2E_WIDGET_PORT = "5184"
$env:SIDECHAT_E2E_SERVICE_PORT = "3102"
npm run test:e2e
```

For the full gate list, see [verification.md](verification.md).
