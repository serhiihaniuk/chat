# Product TODO

Read this when: a capability idea is intentionally deferred, or a known code gap needs tracking before it becomes a feature.
Source of truth for: product work that should not appear as active runtime configuration or public contracts yet.
Not source of truth for: implemented behavior, package ownership, or lifecycle order.

This doc tracks work the system deliberately does not do yet. Each entry names a deferred capability or a known gap plus the prerequisites that gate it. Nothing here is configurable today; do not treat an entry as a hidden feature flag. For shipped configuration, see [the service config](../../apps/partner-ai-service/sidechat.config.ts). For event vocabulary, see [runtime-and-protocol-events.md](../architecture/runtime-and-protocol-events.md).

## Context Management

- History summary context, working name `recent_plus_summary`: support long conversations by admitting recent same-conversation messages plus a generated summary of older history. Before reintroducing this as configuration, define the summary generation owner, persistence timing, refresh policy, token budget accounting, health diagnostics, and tests that prove only authorized history can become model-visible context. Shipped history mode is `recent_messages` only ([sidechat.config.ts](../../apps/partner-ai-service/sidechat.config.ts)).
- Long-term memory and retrieval context: persist durable user, workspace, or project facts and admit retrieved knowledge into model context. Before reintroducing DB schema, capability source types, configuration, or manifests, define the data model, write ownership, retention and deletion policy, tenant/subject authorization, retrieval strategy, redaction and audit behavior, token budgeting, and tests that prove only authorized memory can become model-visible context.

## Known code gaps

Known gaps now live in the working plan at [`plan/00-overview.md`](../../plan/00-overview.md), one story per gap with evidence and acceptance criteria — including the `sidechat.blocked` sequence/schema gap (`plan/16`), the streaming affinity and orphan-turn gaps (`plan/02`–`plan/07`), and the fake quick-start boot failure (`plan/11`). Architecture docs mark each gap inline where it bites.
