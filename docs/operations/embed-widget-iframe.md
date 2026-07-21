# Embed the Widget in Your App

Read this when: you embed the local Side Chat widget harness in a host application through a same-origin development proxy.
Source of truth for: proxy paths, iframe parameters, open/close messaging, page context, and the harness client-tool relay.
Not source of truth for: service configuration ([configuration.md](configuration.md)), widget architecture ([widget-and-host-integration.md](../architecture/widget-and-host-integration.md)), or production authentication.

The repository ships a widget harness, not a production host application. Your app owns the iframe element, launcher control, session authentication, page context, and any browser-side tools.

## Start local Side Chat

```sh
npm run dev
```

The current launcher starts the fake service on `http://127.0.0.1:3000` and the widget harness on `http://127.0.0.1:5175`. Override them with `SIDECHAT_LOCAL_SERVICE_PORT` and `SIDECHAT_LOCAL_WIDGET_PORT`. See [local-development.md](local-development.md).

## Add same-origin proxies

For a Vite host application:

```ts
export default defineConfig({
  server: {
    proxy: {
      "/side-chat-frame": {
        target: "http://127.0.0.1:5175",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/side-chat-frame/, ""),
        ws: true,
      },
      "/side-chat-api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/side-chat-api/, ""),
      },
    },
  },
});
```

Use the same principle with nginx, Caddy, Express, or another host: the browser sees one origin, while the host proxies the frame and API to their local processes. The test harness proxy is the executable reference.

## Embed the frame

```html
<button id="side-chat-toggle" type="button" aria-controls="side-chat-frame" aria-expanded="false">
  Open assistant
</button>
<iframe
  id="side-chat-frame"
  title="Workspace Assistant"
  src="/side-chat-frame/?apiBaseUrl=/side-chat-api&workspaceId=local-workspace&authToken=local-test-token&openControl=host&open=false"
  allow="clipboard-write"
  referrerpolicy="strict-origin-when-cross-origin"
  hidden
></iframe>
```

Harness parameters:

| Parameter           | Meaning                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `apiBaseUrl`        | Same-origin API proxy prefix.                                            |
| `workspaceId`       | Workspace used by the local identity.                                    |
| `authToken`         | Local development bearer. Never put a production bearer in a URL.        |
| `openControl=host`  | The parent page owns visible open/closed state.                          |
| `open=false`        | Initial state.                                                           |
| `clientTools=false` | Optional: disable the harness client tools. They are enabled by default. |

Give the iframe the full open footprint. Widget resize handles resize the panel inside the frame; they cannot resize the host's iframe element. On small screens, use a full-width, bottom-aligned frame so the widget's mobile sheet is not clipped.

## Open/close handshake

The harness uses three same-origin messages:

| Type                         | Direction    | Meaning                                  |
| ---------------------------- | ------------ | ---------------------------------------- |
| `sidechat.widget.ready`      | frame → host | The frame mounted; resend current state. |
| `sidechat.widget.setOpen`    | host → frame | Set the widget open state.               |
| `sidechat.widget.openChange` | frame → host | Widget chrome requested a state change.  |

Always verify both `event.origin` and `event.source`, and send to the exact frame origin rather than `"*"`. Update the button's `aria-expanded`, iframe `hidden`, and widget state together.

## Page context across the iframe

The parent owns page data. Register the package's iframe provider against the exact frame and origin:

```ts
import { registerIframeHostContextProvider } from "@side-chat/host-bridge";

const unregister = registerIframeHostContextProvider({
  frame,
  targetOrigin: new URL(frame.src).origin,
  getContext: async ({ requestId }) => ({
    schemaVersion: "host.page.v1",
    collectedAt: new Date().toISOString(),
    origin: window.location.origin,
    url: window.location.href,
    title: document.title,
    metadata: { requestId, activeRecordId },
  }),
});
```

The frame connects with `connectIframeHostContextProvider` and supplies the provider to its host bridge. The adapter checks the source window, origin, correlation id, response shape, and timeout. Keep registration for the frame lifetime and call `unregister()` when removing it. Do not use DOM reach-through, query-string context, or wildcard origins.

## Client tools across the harness frame

The harness reference bridge relays native client-tool calls with `sidechat.widget.hostToolCall` and returns results with `sidechat.widget.hostToolResult`. Calls remain subject to the originating-tab capability described in [client-tools.md](../architecture/client-tools.md).

The package's public iframe helper currently covers host context only. A production parent-to-frame client-tool relay must implement the same exact-source/origin, correlation, timeout, bounded-result, and capability rules; do not treat the harness message names as an unauthenticated public protocol.

## Verify

```sh
npm run test:e2e
```

The focused iframe scenario is:

```sh
npx playwright test workflow-iframe.spec.ts --config test-harness/widget-harness/e2e/workflow.playwright.config.ts
```

It covers the parent/child context contract, opt-in behavior, correlation, and auth-query exclusion.
