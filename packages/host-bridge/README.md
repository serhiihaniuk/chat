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

`createHostBridge` binds one capability source to both legacy
`dispatchCommand` and native `dispatchToolCall`. `WidgetHostBridge` is the
widget-facing view. The native workflow branch reads `getCapabilities`, maps the
declarations to its per-turn client-tool catalog, and posts the dispatch result
through its service client.

## Main Flows

```txt
protocol branch -> context or host-command event -> dispatchCommand
workflow branch -> dynamic client-tool call -> dispatchToolCall -> durable output endpoint
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
