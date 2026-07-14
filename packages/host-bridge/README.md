# host-bridge

Read this when: editing host context, legacy host commands, or native client-tool behavior.
Source of truth for: this package's ownership, public surface, and local boundaries.
Not source of truth for: runtime tools or backend persistence.

## Owns

- Browser seam for host-provided context.
- Legacy host-command and native client-tool capability gating and dispatch.
- Browser-local command and client-tool result shapes.
- Types that let a host app integrate with the widget.

## Does Not Own

- RuntimeTool registration.
- Agent-runtime tool execution.
- Durable backend command or client-tool results.
- Service routes or database writes.

## Public Surface

`createHostBridge` binds direct host integrations. Page context is an optional,
independent provider: the host registers `contextProvider.getContext`, and the
widget calls it only after the user enables **Include page context** for a send.
Legacy `dispatchCommand` and native `dispatchToolCall` remain a separate
capability source. `WidgetHostBridge` is the widget-facing partial view, so a
commands-only bridge does not imply page-context access.

Iframe hosts use the same provider contract through
`registerIframeHostContextProvider` in the parent and
`connectIframeHostContextProvider` in the frame. The correlated `postMessage`
adapter checks exact source, origin, request id, response shape, and timeout; the
frame never reads the parent DOM.

## Main Flows

```txt
protocol branch -> compatibility context or host-command event -> dispatchCommand
workflow branch -> dynamic client-tool call -> dispatchToolCall -> durable output endpoint
opted-in workflow send -> direct/iframe context provider -> untrusted request context
```

## Boundary Rules

- Host commands and client tools run in the browser; they are not server runtime tools.
- `HostCommandCapability` describes browser/host-app dispatch support, while
  backend `RuntimeTool` implementations live in service/runtime code.
- `chat-protocol` imports are limited to browser-facing host context and
  host-command activity DTOs; neutral JSON primitives come from `shared`.
- Keep the API browser-safe and framework-light.
- Do not import runtime, DB, service, provider, or widget internals.

## Tests

Package-local tests under `src`.

## Canonical Docs

- `docs/domain/vocabulary.md`
- `docs/architecture/extension-seams.md`
- `docs/architecture/package-boundaries.md`
- `docs/architecture/widget-and-host-integration.md`
