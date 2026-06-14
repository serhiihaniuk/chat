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

## Capability Diagnostics

`/healthz` and `/readyz` include a safe `capabilities` object owned by service
composition. It reports whether memory, RAG, research, history context, context
admission, and persistence are disabled, no-op, configured, or misconfigured.

Default local boot is honest about the current app shape:

- memory, RAG, and research seams exist, but their fallback adapters return no
  candidates unless concrete adapters are injected;
- prior conversation history is not admitted into runtime context yet;
- context admission currently records an include-all policy rather than enforcing
  a token budget;
- memory repositories are process-local and not durable.

Production-profile composition rejects enabled memory, RAG, or research
declarations when the matching concrete adapter is missing. Diagnostics never
include secrets, connection strings, raw memory, retrieved text, provider
requests, or private context-board content.

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
