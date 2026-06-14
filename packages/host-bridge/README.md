# host-bridge

Read this when: editing host context or host command behavior.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: runtime tools or backend persistence.

## Owns

- Browser seam for host-provided context.
- Host command dispatch and local command result shape.
- Types that let a host app integrate with the widget.

## Does Not Own

- RuntimeTool registration.
- Agent-runtime tool execution.
- Durable backend host-command results.
- Service routes or database writes.

## Public Surface

Host bridge types, context readers, and command dispatcher helpers.

## Main Flows

```txt
widget asks bridge -> host provides context or command result -> widget displays result
```

## Boundary Rules

- Host commands are not runtime tools by default.
- `HostCommandCapability` describes browser/host-app dispatch support, while
  backend `RuntimeTool` implementations live in service/runtime code.
- Keep the API browser-safe and framework-light.
- Do not import runtime, DB, service, provider, or widget internals.

## Tests

Package-local tests under `src`.

## Canonical Docs

- `docs/domain/vocabulary.md`
- `docs/architecture/extension-seams.md`
- `docs/architecture/package-boundaries.md`
- `docs/architecture/widget-and-host-integration.md`
