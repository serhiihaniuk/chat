# Embed The Widget In An Iframe

Read this when: you embed Side Chat locally as an iframe behind a host page, or you wire the Workbench dev proxy.
Source of truth for: local iframe embedding, the widget harness base path, and the Workbench dev proxy.
Not source of truth for: the no-Docker launch flow (see [local-development.md](local-development.md)); widget/host-bridge architecture (see [../architecture/widget-and-host-integration.md](../architecture/widget-and-host-integration.md)); production host deployment.

A host web app embeds Side Chat as a same-origin iframe. The host page renders the open/close button and the iframe; the iframe renders only Side Chat. The host page proxies two prefixes to the running dev servers: `/side-chat-frame` to the widget UI and `/side-chat-api` to the service. Start everything with the local launcher, then open the printed host page URL.

## Servers And Ports

The launcher `scripts/run-local-fake.mjs` starts three dev servers. [local-development.md](local-development.md) owns that launch flow and the provider/seed options; this table lists only the ports the proxy targets:

| Server | Default origin | Role |
| --- | --- | --- |
| Service | `http://127.0.0.1:8787` | Hono API; `/side-chat-api` proxy target (`run-local-fake.mjs:57`). |
| Widget UI | `http://127.0.0.1:5174` | Vite widget harness; `/side-chat-frame` proxy target (`run-local-fake.mjs:58`, strictPort). |
| Host page | `http://127.0.0.1:8080` | Vite host page that owns the proxies and the open/close button (`run-local-fake.mjs:59`). |

Launch the stack, then open the host page (not the raw widget URL):

```powershell
node scripts/run-local-fake.mjs --yes
```

Keep the host page on `8080` and the widget UI off `8080`. The launcher rejects `8080` for the widget and forces it back to `5174` (`run-local-fake.mjs:668-672`).

## Open The Example Host Page

The launcher prints an embedded host page URL backed by `test-harness/widget-harness/public/workbench-embed.html`:

```text
http://127.0.0.1:8080/workbench-embed.html?authToken=local-compose-token&workspaceId=workspace_local&apiBaseUrl=/side-chat-api&framePath=/side-chat-frame/
```

Open that page first. It builds the iframe `src`, proxies `/side-chat-frame` and `/side-chat-api`, and owns the visible open/close button. The direct widget URL (`http://127.0.0.1:5174/side-chat-frame/?...`) renders the frame contents alone; use it only to debug the frame.

## Workbench Dev Proxy

The host page Vite config `test-harness/widget-harness/vite.host.config.ts` forwards two prefixes. The launcher passes targets through env (`run-local-fake.mjs:817-820`):

| Prefix | Target env (default) | Rewrite |
| --- | --- | --- |
| `/side-chat-frame` | `SIDECHAT_WIDGET_HOST_UI_TARGET` (`http://127.0.0.1:5174`) | Forward unchanged; `ws: true` (`vite.host.config.ts:51-56`). |
| `/side-chat-api` | `SIDECHAT_WIDGET_HOST_API_TARGET` (`http://127.0.0.1:8787`) | Strip the prefix, then forward to the service root (`vite.host.config.ts:57-60`). |

Two rules keep asset URLs inside the proxy:

- **Match the base path to the frame prefix.** The launcher serves the widget under `SIDECHAT_WIDGET_HARNESS_BASE_PATH=/side-chat-frame/` (`run-local-fake.mjs:803`). The widget therefore emits `/side-chat-frame/...` module and asset URLs, so forward that prefix unchanged. Strip the prefix only on the API proxy.
- **Reuse this host config for your own Workbench.** It already owns both proxies. The widget harness's own Vite config is the proxy target, not a host; keep them separate.

## Iframe Markup

A host page embeds the same-origin frame path. The widget reads its query params in `test-harness/widget-harness/src/config/modes.ts:29-41`:

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
| `apiBaseUrl` | `/side-chat-api` | Same-origin API prefix the host proxies. |
| `openControl` | `host` | The host page owns open/close; the widget defers (`modes.ts:61-64`). |
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

## Host Open/Close Handshake

The host page owns the visible state and drives the iframe with three `postMessage` types (`harness-app.tsx:16-18`):

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

`workbench-embed.html` is the reference implementation of this handshake.

> Token note: the local `authToken` is a dev bearer (the launcher prints it; the harness default is `local-compose-token`). Do not ship query-string tokens. A production host mints a short-lived frame session or relies on its own auth boundary. Keep real secrets out of markup and URLs.

## Resize Boundary

Side Chat's resize handles resize the panel **inside** the iframe; they never resize the host iframe element. Give the iframe a large fixed viewport (the dock above). If the panel seems stuck, check the host CSS first:

- Size the iframe to its open footprint, not to the closed launcher or current content.
- Do not nest the iframe in a small `overflow: hidden` container.
- Do not apply `pointer-events: none`, transforms, or scaling to the iframe.
- Keep the iframe visible while open; hide it only when the host state is closed.
- To make the outer iframe user-resizable, build that as host-page behavior, separate from the panel handles.

## Verify The Embed

Run the browser lane before handing the integration to a host app. It starts the service with the fake provider and memory persistence, then checks both the direct widget page and an iframe-hosted page:

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
