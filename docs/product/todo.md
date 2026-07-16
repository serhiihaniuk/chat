# Product TODO

Read this when: a capability is intentionally deferred or a known product gap needs tracking.
Source of truth for: work that must not appear as shipped configuration or public contract yet.
Not source of truth for: implemented behavior, ownership, or lifecycle order.

Shipped configuration lives in [`apps/side-chat-service/sidechat.config.ts`](../../apps/side-chat-service/sidechat.config.ts). Current stream behavior lives in [runtime-and-protocol-events.md](../architecture/runtime-and-protocol-events.md).

## Context management

- **History summaries.** Support long conversations with recent authorized messages plus a generated summary of older history. Before exposing configuration, define generation ownership, persistence timing, refresh policy, token accounting, privacy classification, health signals, and tests proving only authorized history becomes model-visible.
- **Long-term memory and retrieval.** Persist and retrieve durable user, workspace, or project facts. Before adding schema or configuration, define write ownership, retention/deletion, tenant and subject authorization, retrieval policy, redaction/audit behavior, token budgets, and deletion tests.

## Release engineering

- Wire `npm run verify` into the chosen CI service before an alpha tag so local and remote gates match.
- Add the intended license before publishing the starter outside the owning organization.

The [`plan/v7/`](../../plan/v7/README.md) folder is planning history. Canonical architecture and operations docs describe shipped behavior directly.
