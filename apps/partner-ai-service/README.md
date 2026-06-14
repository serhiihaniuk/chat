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

Context admission diagnostics expose the configured policy id, the actual
selection mode, and a secret-free recorded budget. Today that means
`policyId: deterministic_v1` with `selectionMode: include_all`; later budgeted
admission must change the selection mode only when candidates can really be
dropped under budget pressure.

Production-profile composition rejects enabled memory, RAG, or research
declarations when the matching concrete adapter is missing. Diagnostics never
include secrets, connection strings, raw memory, retrieved text, provider
requests, or private context-board content.

## Capability Configuration

`partner-ai-core` owns the portable capability configuration contract used by
manifests, policy, and context preparation. This service parses `SIDECHAT_*`
environment values and adds deployable adapter modes such as no-op, Postgres,
HTTP, external, or LangGraph.

Local defaults are explicit and fail closed:

| Env key                                   | Local default      | Meaning                                                                |
| ----------------------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `SIDECHAT_MEMORY_MODE`                    | `disabled`         | `disabled` or explicit `noop`; concrete modes need a memory adapter.   |
| `SIDECHAT_MEMORY_AUTO_WRITE`              | `disabled`         | `disabled`, `propose_only`, or `auto_apply` for future memory writes.  |
| `SIDECHAT_MEMORY_DEFAULT_SCOPE`           | `user`             | Default manifest memory scope when memory is enabled.                  |
| `SIDECHAT_RAG_MODE`                       | `disabled`         | `disabled` or explicit `noop`; concrete modes need a retriever.        |
| `SIDECHAT_RAG_SOURCES`                    | empty              | Comma-separated retrieval source ids for manifest declarations.        |
| `SIDECHAT_RAG_FAILURE_MODE`               | `degrade`          | Parsed for later retriever behavior.                                   |
| `SIDECHAT_RESEARCH_MODE`                  | `disabled`         | `disabled` or explicit `noop`; concrete modes need a research adapter. |
| `SIDECHAT_RESEARCH_FAILURE_MODE`          | `degrade`          | Parsed for later research behavior.                                    |
| `SIDECHAT_HISTORY_MODE`                   | `disabled`         | `disabled`, `recent_messages`, or `recent_plus_summary`.               |
| `SIDECHAT_HISTORY_MAX_MESSAGES`           | `12`               | Parsed history window size for the later history-context phase.        |
| `SIDECHAT_HISTORY_MAX_TOKENS`             | `4000`             | Parsed history token budget.                                           |
| `SIDECHAT_CONTEXT_ADMISSION_POLICY`       | `deterministic_v1` | Recorded context admission policy id.                                  |
| `SIDECHAT_CONTEXT_MAX_INPUT_TOKENS`       | `24000`            | Recorded model input budget.                                           |
| `SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS` | `4000`             | Reserved output budget; must be below max input tokens.                |
| `SIDECHAT_CONTEXT_MAX_HISTORY_TOKENS`     | `4000`             | Recorded per-source history budget.                                    |
| `SIDECHAT_CONTEXT_MAX_MEMORY_TOKENS`      | `2000`             | Recorded per-source memory budget.                                     |
| `SIDECHAT_CONTEXT_MAX_RAG_TOKENS`         | `8000`             | Recorded per-source RAG budget.                                        |
| `SIDECHAT_CONTEXT_MAX_RESEARCH_TOKENS`    | `4000`             | Recorded per-source research budget.                                   |

Example local path that declares capabilities without pretending they are real
adapters:

```sh
SIDECHAT_MEMORY_MODE=noop \
SIDECHAT_RAG_MODE=noop \
SIDECHAT_RAG_SOURCES=docs,tickets \
SIDECHAT_RESEARCH_MODE=noop \
SIDECHAT_HISTORY_MODE=recent_messages \
npm run dev --workspace @side-chat/partner-ai-service
```

This reports memory, RAG, research, and history as no-op or not-yet-enforced in
diagnostics. Production-profile config rejects those enabled declarations until
the matching concrete adapters are provided.

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
