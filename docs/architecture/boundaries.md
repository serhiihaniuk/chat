# Boundaries

Read this when: a change crosses packages, protocols, runtime, persistence, or
the widget.
Source of truth for: what data and dependencies must not cross each seam.
Not source of truth for: product requirements or every import rule.

## Boundary Table

| Boundary         | Source                    | Target                     | Must preserve                                          | Must not leak                               |
| ---------------- | ------------------------- | -------------------------- | ------------------------------------------------------ | ------------------------------------------- |
| HTTP adapter     | HTTP/Hono request         | StreamChatInput            | Auth, request id, body validation, transport errors    | Hono objects into core                      |
| Product core     | StreamChatInput and ports | SidechatStreamEvent stream | Policy, context, persistence order, terminal semantics | DB rows, provider DTOs, browser UI state    |
| Runtime          | AgentRuntimeRequest       | RuntimeEvent stream        | Selected executor and prepared turn execution only     | Product auth/persistence policy             |
| Provider adapter | RuntimeProviderRequest    | AI SDK/provider stream     | Provider selection and options                         | AI SDK parts outside runtime                |
| Protocol         | Core event mapper         | `sidechat.v1` events       | Browser-safe DTOs and sequence                         | Runtime/provider/database/framework objects |
| Widget           | Protocol stream events    | UI message/activity state  | Visible state and accessibility                        | Effect, provider DTOs, service internals    |
| Host bridge      | Widget/product host seam  | Host commands/context      | Host app ownership                                     | Runtime tools by implication                |
| Database         | Repository ports          | Persistence records        | Durable contracts                                      | Drizzle/Postgres outside `db` adapters      |
| Shared UI/vendor | Copied visual primitives  | Render-only components     | Visual composition only                                | Product behavior or runtime knowledge       |

## Import Rules

- Hono imports stay under `apps/partner-ai-service`.
- AI SDK and provider SDK imports stay under `packages/agent-runtime`.
- Drizzle/Postgres imports stay under `packages/db`.
- React imports stay in widget and `test-harness` UI code.
- Effect imports stay out of browser/client/widget public APIs.
- Cross-package imports use package names, not relative paths.

## Data Rules

- `chat-protocol` owns browser-facing DTOs.
- `shared` owns domain-neutral JSON primitives and optional object-field helpers.
- `agent-runtime` owns RuntimeEvent, RuntimeActivity details, and
  provider-ready request details.
- `partner-ai-core` owns product workflow types and ports.
- `db` owns persistence records and adapters.
- The widget owns UI state types.
- Runtime, database, and service persistence code must not import
  `chat-protocol` only to get JSON primitives or runtime activity shapes.

## Related Checks

- `scripts/check-boundaries.mjs`
- `scripts/check-runtime-boundaries.mjs`
- `scripts/check-widget-layers.mjs`
- `scripts/check-package-exports.mjs`
- `scripts/check-human-readability.mjs`
