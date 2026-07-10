# chat-protocol

Read this when: editing `sidechat.v1` request, event, schema, or SSE helpers.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: runtime events or widget state.

## Owns

- Browser-facing `sidechat.v1` DTOs.
- Protocol constants and validators.
- SSE encode/decode helpers.
- `TurnActivityEvent` (type `sidechat.turn-activity`) and its codec
  (`encodeTurnActivitySseEvent` / `decodeTurnActivitySseEvents` in
  `sidechat-v1/codec/activity-sse-codec.ts`). This is the cross-conversation turn
  lifecycle event carried on the subject-scoped activity stream, distinct from the
  in-turn `ActivityEvent` (`sidechat.activity`, reasoning/tool steps inside one turn).
- The hand-maintained JSON Schema and parity/completeness tests that keep it
  synchronized with the TypeScript contract.

## Does Not Own

- RuntimeEvent shapes.
- Provider-native or AI SDK stream parts.
- Hono request/response objects.
- Widget rendering state.

## Public Surface

Protocol types, constants, validators, sequence checks, and SSE codec helpers,
including the `TurnActivityEvent` type and its activity SSE codec.

## Main Flows

```txt
ChatStreamRequest validation
SidechatStreamEvent validation
SSE encode/decode round trip
```

## Boundary Rules

- Keep protocol DTOs browser-safe.
- Do not import React, Hono, Effect, DB, AI SDK, or runtime internals.
- Update the hand-maintained schema and its parity tests in the same change as a
  protocol shape.

## Tests

Package-local tests under `src/sidechat-v1`.

## Canonical Docs

- `docs/domain/vocabulary.md`
- `docs/architecture/runtime-and-protocol-events.md`
- `docs/architecture/package-boundaries.md`
- `docs/operations/verification.md`
