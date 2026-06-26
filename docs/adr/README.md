# Architecture Decision Records

Read this when: you want the list of accepted architecture decisions and why each boundary or contract exists.
Source of truth for: the ADR index (number, decision, status) and the ADR format and immutability rule.
Not source of truth for: how the current system works (see [../architecture/](../architecture/)) or any domain term (see [../domain/vocabulary.md](../domain/vocabulary.md)).

An Architecture Decision Record (ADR) captures one significant, hard-to-reverse decision: the context that forced a choice, the decision itself, and the consequences the team accepts. In Side Chat, each ADR is short, dated by its number, and immutable once accepted — when a decision changes, add a new ADR or amend the existing one rather than rewriting history. ADRs record *why* a boundary or contract exists; the canonical architecture docs under [../architecture/](../architecture/) describe how the current system works.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-host-command-result-durability.md) | Host command results stay client-local; no backend result route, protocol event, or persistence yet. | Accepted |
| [0002](0002-openai-responses-provider.md) | First real provider adapter uses OpenAI Responses, inside `agent-runtime`, selected by config. | Accepted |
| [0003](0003-modular-monolith.md) | Ship one partner AI service as a modular monolith with bounded internal packages. | Accepted |
| [0004](0004-product-protocol.md) | `sidechat.v1` is the product protocol; routes, events, widget, schema, and OpenAPI move together. | Accepted |
| [0005](0005-no-owned-host-app.md) | The repo ships no production host app; the host is the host-bridge plus widget fixtures. | Accepted |
| [0006](0006-partner-ai-core-boundary.md) | Keep `partner-ai-core` hexagonal and framework-free; expose Effect programs, not framework wrappers. | Accepted |
| [0007](0007-database-boundary.md) | `packages/db` owns persistence; production uses Postgres plus Drizzle and fails closed without a DB URL. | Accepted |
| [0008](0008-ai-sdk-runtime.md) | The AI SDK is the runtime engine; the surface is Agent-first and Effect-first, with `streamText` private. | Accepted |
| [0009](0009-resumable-server-owned-streaming.md) | Make assistant turns server-owned and resumable via a durable `turn_events` log and a two-call HTTP flow. | Accepted |
