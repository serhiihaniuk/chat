# partner-ai-service

Read this when: editing the HTTP service, adapters, or composition root.
Source of truth for: this app's ownership, public surface, and local boundaries.
Not source of truth for: global vocabulary or product requirements.

## Owns

- Hono HTTP routes and middleware.
- Auth, config, persistence, policy, provider, and tool adapters.
- Composition of `partner-ai-core`, `agent-runtime`, and `db`.
- SSE response conversion at the transport edge.

## Does Not Own

- Product workflow policy; that lives in `partner-ai-core`.
- Provider/AI SDK execution details; those live in `agent-runtime`.
- Browser protocol definitions; those live in `chat-protocol`.
- Widget state or rendering.

## Public Surface

- Local server entrypoint.
- HTTP routes for chat stream and resource endpoints.
- Service adapter factories used by the composition root.

## Main Flows

```txt
HTTP request -> auth/request parsing -> StreamChatInput
  -> streamChatEffect -> SSE response
```

## Boundary Rules

- Hono objects do not enter core.
- Promise/AsyncIterable conversion happens at HTTP edges.
- App-owned concrete tools are injected into runtime through core/service ports.

## Tests

- `src/inbound/http/*.test.ts`
- Adapter and config tests under `src/**`

## Related Docs

- `docs/architecture/boundaries.md`
- `docs/architecture/stream-chat-flow.md`
- `docs/architecture/testing-and-verification.md`
