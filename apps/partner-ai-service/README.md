# partner-ai-service

Read this when: editing the HTTP service, adapters, or composition root.
Source of truth for: this app's ownership, public surface, and local boundaries.
Not source of truth for: global vocabulary or product requirements.

## Owns

- Hono HTTP routes, middleware, and SSE response conversion.
- Auth, config, persistence, policy, provider, and tool adapters.
- Concrete turn guard, host-command, tool, persistence, policy, and
  observability adapter starting points.
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
- `src/composition/providers/service-provider-registry.ts`
- `src/composition/tools/service-tool-registry.ts`
- `src/adapters/README.md`
- `src/config/service-config.ts`
- `src/config/service-conversation-title-config.ts`

## Capability Diagnostics

`/healthz` and `/readyz` include a safe `capabilities` object owned by service
composition. It reports whether history context, context admission, and
persistence are disabled, configured, or misconfigured. The same endpoints
report secret-free `providers` and `tools` registry status: provider ids, model
ids, default selection, and tool names with their default-enabled and approval
policy ids. Provider secrets and tool payloads stay hidden.

Provider and tool registries are the single source for those surfaces.
`createServiceProviderRegistry` validates provider/model registrations and picks
the runtime identity. `createServiceToolRegistry` turns each
`ServiceToolRegistration` into both a manifest capability and the matching
runtime executable, so a tool cannot be declared without an executable behind
it.

The chat resource surface includes `GET /chat/conversations` for the current
authorized workspace subject and `GET /chat/history/:conversationId` for
hydrating a selected conversation. Service composition owns the conversation
title prompt/config. Core runs that config through a no-tools runtime basic
agent after the first successful turn, sanitizes the output, and stores the
title once; older records with no stored title still fall back to safe
first-message text while listed. Both routes use repository scoping and never
accept a caller-supplied subject id.

Default local boot is honest about the current app shape:

- prior conversation history is disabled by default; `recent_messages` admits
  authorized same-conversation user/assistant messages before the current user
  message, and reset starts a new history boundary; `recent_plus_summary` is
  parsed for the future summary lane but reports misconfigured until summary
  generation exists;
- context admission enforces deterministic token budgets before optional
  context reaches runtime;
- in-memory repositories are process-local and not durable.

Context admission diagnostics expose the configured policy id, the actual
selection mode, and a secret-free recorded budget. `policyId:
deterministic_v1` with `selectionMode: budgeted` means the context manager can
drop optional candidates under token pressure and record safe drop reasons in
the manifest.

Persistence diagnostics are derived from the composed repository adapter. A
`SIDECHAT_DATABASE_URL` selects the Postgres/Drizzle repositories; local
in-memory repositories report `persistence: memory` and remain explicitly
non-production-safe because they reset with the process.

Production-profile composition rejects summary history until the matching
implementation exists. Diagnostics never include secrets, connection strings,
provider requests, or private context-board content.

## Capability Configuration

`partner-ai-core` owns the portable capability configuration contract used by
policy and context preparation. This service parses `SIDECHAT_*` environment
values for the implemented RC capabilities.

Local defaults are explicit and fail closed:

| Env key                                   | Local default      | Meaning                                                           |
| ----------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| `SIDECHAT_HISTORY_MODE`                   | `disabled`         | `disabled`, `recent_messages`, or future `recent_plus_summary`.   |
| `SIDECHAT_HISTORY_MAX_MESSAGES`           | `12`               | Maximum same-conversation messages admitted into runtime context. |
| `SIDECHAT_HISTORY_MAX_TOKENS`             | `4000`             | Approximate token budget for admitted conversation history.       |
| `SIDECHAT_CONTEXT_ADMISSION_POLICY`       | `deterministic_v1` | Recorded context admission policy id.                             |
| `SIDECHAT_CONTEXT_MAX_INPUT_TOKENS`       | `24000`            | Recorded model input budget.                                      |
| `SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS` | `4000`             | Reserved output budget; must be below max input tokens.           |
| `SIDECHAT_CONTEXT_MAX_HISTORY_TOKENS`     | `4000`             | Recorded per-source history budget.                               |

Example local path that enables recent conversation history:

```sh
SIDECHAT_HISTORY_MODE=recent_messages \
npm run dev --workspace @side-chat/partner-ai-service
```

History reports the repository-backed context adapter when `recent_messages` is
enabled. `recent_plus_summary` reports `missing-history-summary-generator` and
is not production-safe until summary generation is implemented.

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
