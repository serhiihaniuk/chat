# Shared Protocol (`sidechat.v1`)

## Purpose
Reusable protocol contract for the side-chat assistant project.

## Scope
- DTOs and schema validation for request payloads
- SSE event parsing/encoding helpers
- Stream sequence validator
- Request/response header contracts
- Golden fixtures for stream golden-tests

## Protocol
- Header: `X-Sidechat-Protocol: sidechat.v1`
- Request endpoint contract (POST): `/chat/stream`
  - Headers: `Content-Type: application/json`, `Accept: text/event-stream`, `X-Sidechat-Protocol`
  - Optional: `X-Request-Id`
- Response stream headers:
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-cache, no-transform`
  - Optional: `Connection: keep-alive`
  - `X-Sidechat-Protocol: sidechat.v1`
  - `X-Request-Id`

## Event sequence requirements
- Stream must contain exactly one terminal event: `sidechat.completed` or `sidechat.error`
- `sidechat.delta` events are not allowed after terminal
- `sidechat.started` must be unique
- Terminal `requestId` must match prior events

## Exports
- `src/index.ts` exports:
  - `types`, `schemas`, `codec`, `sequence`, `contracts`

## Test coverage
- Fixtures in `src/sidechat.v1/fixtures`
- Tests in `tests/sidechat-protocol.test.ts`
