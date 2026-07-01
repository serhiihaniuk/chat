# Architecture Decision Records

Read this when: you want the list of accepted architecture decisions and why each boundary or contract exists.
Source of truth for: the ADR index (number, decision, status) and the ADR format rule.
Not source of truth for: how the current system works (see [../architecture/](../architecture/)) or any domain term (see [../domain/vocabulary.md](../domain/vocabulary.md)).

An Architecture Decision Record (ADR) captures one significant, hard-to-reverse
decision: the context that forced it, the decision, and the consequences the
team accepts. ADRs record *why*; the docs under
[../architecture/](../architecture/) describe *how* the current system works.

The set was rebaselined on 2026-07-01 (the pre-release rewrites had left the
old records describing superseded designs; git history preserves them) and
numbered in reading order on 2026-07-02. From this baseline on, ADRs are
immutable once accepted — when a decision changes, add a new ADR that
supersedes the old one.

The numbering reads as a story — what the product is, how it is shaped, what
it stands on, its contracts, its engine, how a turn runs and survives, and how
it is configured and observed:

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-no-owned-host-app.md) | The repo ships no production host app; the host is the host-bridge contract plus harness fixtures. | Accepted |
| [0002](0002-modular-monolith-and-layers.md) | One deployable service; four layers with gate-enforced inward dependencies; core hexagonal; db owns persistence and fails closed in production. | Accepted |
| [0003](0003-effect-as-core-effect-system.md) | Effect v4 powers the server path (lifecycle, interruption, resources) and is gate-contained there; adopter seams stay Effect-optional; v4-beta pinned deliberately to skip a v3 migration. | Accepted |
| [0004](0004-sidechat-v1-product-protocol.md) | `sidechat.v1` is the single browser↔service contract; routes, events, widget, schema, and OpenAPI move together. | Accepted |
| [0005](0005-runtime-port-replaceable-engines.md) | `AiRuntimePort` is the only door between core and any generation engine; delegation, providers, executors, and whole engines plug in at four sized levels. | Accepted |
| [0006](0006-ai-sdk-runtime.md) | The AI SDK is the runtime engine, gate-confined to one package behind SDK-free contracts; providers swap via config; the Vercel-lock-in and Python/LangGraph objections are answered in the record. | Accepted |
| [0007](0007-connection-bound-streaming.md) | Turns are server-owned and connection-bound: live events in a per-instance registry, final state in Postgres, no durable event log, no sticky routing. | Accepted |
| [0008](0008-crash-recovery-lease-sweep.md) | Hard-crash recovery is durable breadcrumbs + a fleet-safe lease sweep with epoch fencing; in-memory state is never the truth; clients converge via DB polls. | Accepted |
| [0009](0009-host-command-await-and-result-relay.md) | Host commands pause the tool loop on a bounded in-memory await; results return on a side-door POST and relay to the owner via durable write + `pg_notify` poke. | Accepted |
| [0010](0010-readable-declarative-config.md) | Service behavior lives in one deliberately repetitive, human-readable config file per variant; no config-generating code; env declared inline via `readEnv` references. | Accepted |
| [0011](0011-observability-channels-and-console-first-dev.md) | Two observability channels — redacted turn telemetry (sink port) + leveled operational diagnostics — console-first in development, fail-open always, redaction unconditional. | Accepted |
| [0012](0012-widget-architecture.md) | The widget is iframe-isolated, Effect-free, FSD-structured; TanStack Query for reads, store+pure reducer for the live stream, no client merge; scoped tokens, light themes only. | Accepted |
| [0013](0013-governance-harness.md) | Governance is executable: 14 gates, cognitive budgets, doc contracts, and a meta-gate hold AI-built code to standard; rules are gates or recorded decisions, never conventions. | Accepted |
