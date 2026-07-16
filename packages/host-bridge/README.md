# host-bridge

Read this when: editing browser page context or native client-tool integration.
Source of truth for: this package's public seam and local boundaries.
Not source of truth for: server tools, workflow execution, or persistence.

## Owns

- Optional host-provided page context.
- Native client-tool capability descriptions.
- Browser-local tool dispatch and safe result shapes.
- Direct and correlated iframe context adapters.

`createHostBridge` exposes independent optional methods. A host may provide page
context, client tools, or both. The widget collects context only for an opted-in
send. It checks current capabilities before dispatching a dynamic client tool.

Iframe context uses `postMessage` with exact source, origin, request-id, response
shape, and timeout checks. The frame never reads the parent DOM.

```txt
opted-in send -> getContext -> untrusted request context
dynamic client tool -> getCapabilities -> dispatchToolCall -> safe tool result
```

## Boundary rules

- Keep the package browser-safe and framework-light.
- Import neutral JSON values from `@side-chat/shared`.
- Do not import the widget, service, database, Hono, provider SDKs, or Workflow internals.
- Client tools execute in the host browser; server tools execute in the service.

Package-local tests live under `src`.
