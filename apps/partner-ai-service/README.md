# partner-ai-service

Read this when: editing the HTTP service, adapters, or composition root.
Source of truth for: this app's ownership, public surface, and local boundaries.
Not source of truth for: global vocabulary or product requirements.

## Owns

- Hono HTTP routes, middleware, and SSE response conversion.
- Auth, config, persistence, policy, provider, and tool adapters.
- Concrete turn guard, RAG, research, memory, host-command, and observability
  adapter starting points.
- Deployable service composition of core, runtime, DB, and enterprise adapters.
- Local development/test fixtures that are explicitly enabled by config.

## Does Not Own

- Product workflow policy or lifecycle decisions.
- Provider/AI SDK execution details.
- Browser protocol definitions.
- Widget state or rendering.
- A production host app.

## First Files To Open

- `src/inbound/http/app.ts`
- `src/inbound/http/routes/chat/chat-stream.ts`
- `src/composition/service-composition.ts`
- `src/composition/manifest/service-capability-manifest.ts`
- `src/adapters/README.md`
- `src/config/service-config.ts`

## Verify

- `npm test --workspace @side-chat/partner-ai-service`
- `npm run lint:custom`
- Full gate: `npm run verify`

## Canonical Docs

- `docs/architecture/system-map.md`
- `docs/architecture/assistant-turn.md`
- `docs/architecture/extension-seams.md`
- `docs/architecture/package-boundaries.md`
- `docs/operations/verification.md`
