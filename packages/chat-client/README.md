# chat-client

Read this when: editing the browser-safe client or SSE reader.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: protocol definitions or widget rendering.

## Owns

- Browser-safe stream client.
- SSE response reading and protocol event decoding.
- Transport, parse, and protocol failure separation for client callers.

## Does Not Own

- Protocol type definitions.
- Widget message/activity state.
- Runtime or provider internals.
- Service framework behavior.

## Public Surface

Client creation and stream/resource request helpers.

## Main Flows

```txt
fetch response -> SSE chunks -> SidechatStreamEvent values
```

## Boundary Rules

- Consume only `chat-protocol` events.
- Do not import React, Effect, AI SDK, Hono, DB, or runtime packages.
- Keep failures actionable for widget and host callers.

## Tests

Package-local stream and client tests under `src`.

## Related Docs

- `docs/domain/lifecycle.md`
- `docs/architecture/boundaries.md`
