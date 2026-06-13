# partner-ai-service

Read this when: editing the HTTP service, adapters, or composition root.
Source of truth for: this app's ownership, public surface, and local boundaries.
Not source of truth for: global vocabulary or product requirements.

## Owns

- Hono HTTP routes and middleware.
- Auth, config, persistence, policy, provider, and tool adapters.
- Concrete turn guard registries and guard adapters.
- Concrete RAG retrievers and retrieved-context mapping.
- Concrete memory adapters and recalled-memory context mapping.
- Deployable service composition of `partner-ai-core`, `agent-runtime`, `db`,
  and concrete enterprise adapters.
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
- App-owned agent executors are injected into runtime through service
  composition; executor ids are not browser or manifest capabilities.
- Tool declarations (`ToolCapability`) and executable tools (`RuntimeTool`) are
  wired separately so a manifest entry does not silently become model access.
- Host commands are browser/host-app UI interactions and stay outside the
  runtime tool registry.
- RAG retrievers are injected through service composition and mapped to prepared
  context before runtime execution.
- Memory adapters are injected through service composition; recall maps to
  prepared context and write candidates run after successful turns.
- Mock or demo tools are local development and test fixtures; production
  profiles must fail closed instead of exposing them by default.

## Tests

- `src/inbound/http/*.test.ts`
- Adapter and config tests under `src/**`

## Adapter Starting Points

- Backend runtime tools: `src/adapters/tools/`
- Enterprise tool example: `src/adapters/tools/examples/jira-search-issues-tool.ts`
- RAG adapters: `src/adapters/rag/`
- Memory adapters: `src/adapters/memory/`
- Turn guard registries: `src/adapters/guards/`

Service composition accepts runtime tool implementations separately from
manifest declarations. Selected tool names that lack an executable registration
fail closed in `agent-runtime`.

Service composition also accepts runtime executor implementations separately
from tools. Unknown executor ids fail closed in `agent-runtime` before the
executor stream starts.

## Related Docs

- `docs/architecture/boundaries.md`
- `docs/architecture/foundation-overview.md`
- `docs/architecture/capability-model.md`
- `docs/architecture/stream-chat-flow.md`
- `docs/architecture/testing-and-verification.md`
