# Architecture Decision Records

Read this when: you want the list of accepted architecture decisions and why each boundary or contract exists.
Source of truth for: the ADR index (number, decision, status) and the ADR format rule.
Not source of truth for: how the current system works (see [../architecture/](../architecture/)) or any domain term (see [../domain/vocabulary.md](../domain/vocabulary.md)).

An Architecture Decision Record (ADR) captures one significant, hard-to-reverse
decision: the context that forced it, the decision, and the consequences the
team accepts. ADRs record _why_; the docs under
[../architecture/](../architecture/) describe _how_ the current system works.

The set was rebaselined on 2026-07-01 (the pre-release rewrites had left the
old records describing superseded designs; git history preserves them) and
numbered in reading order on 2026-07-02. From this baseline on, ADRs are
immutable once accepted — when a decision changes, add a new ADR that
supersedes the old one.

The numbering reads as a story — what the product is, how it is shaped, what
it stands on, its contracts, its engine, how a turn runs and survives, and how
it is configured and observed:

| ADR                                                          | Decision                                                                                                                                                                        | Status                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| [0001](0001-no-owned-host-app.md)                            | The repo ships no production host app; the host is the host-bridge contract plus harness fixtures.                                                                              | Accepted                          |
| [0002](0002-modular-monolith-and-layers.md)                  | Earlier modular-monolith package split; replaced by the single service application and current package boundaries.                                                              | Superseded by 0014–0016           |
| [0003](0003-effect-as-core-effect-system.md)                 | Earlier Effect-first server design; replaced by the plain TypeScript AI SDK/Workflow architecture.                                                                              | Superseded by 0014                |
| [0004](0004-sidechat-v1-product-protocol.md)                 | Earlier custom browser protocol; replaced by the native AI SDK UI-message stream profile.                                                                                       | Superseded by 0015                |
| [0005](0005-runtime-port-replaceable-engines.md)             | Earlier runtime-port engine seam; replaced by app-local provider ports and native AI SDK execution.                                                                             | Superseded by 0014                |
| [0006](0006-ai-sdk-runtime.md)                               | Earlier isolated runtime-package decision; replaced by AI SDK 7 as the service application core.                                                                                | Superseded by 0014                |
| [0007](0007-connection-bound-streaming.md)                   | Earlier connection-bound in-memory stream; replaced by durable Workflow journal replay.                                                                                         | Superseded by 0016–0018           |
| [0008](0008-crash-recovery-lease-sweep.md)                   | Earlier lease-sweep recovery; replaced by Workflow recovery and terminal reconciliation.                                                                                        | Superseded by 0016–0018           |
| [0009](0009-host-command-await-and-result-relay.md)          | Earlier browser-action relay; replaced by durable native client tools and originating-tab authority.                                                                            | Superseded by 0015–0016           |
| [0010](0010-readable-declarative-config.md)                  | Service behavior lives in one deliberately repetitive, human-readable config file per variant; no config-generating code; env declared inline via `readEnv` references.         | Accepted                          |
| [0011](0011-observability-channels-and-console-first-dev.md) | Earlier observability composition; its privacy intent remains, but the app-local telemetry implementation replaced its ports.                                                   | Superseded by 0014                |
| [0012](0012-widget-architecture.md)                          | Widget FSD and iframe boundaries; its transport branch was replaced by the single Workflow-backed session.                                                                      | Partially superseded by 0015–0017 |
| [0013](0013-governance-harness.md)                           | Governance is executable: 15 gates, cognitive budgets, doc contracts, and a meta-gate hold AI-built code to standard; rules are gates or recorded decisions, never conventions. | Accepted                          |
| [0014](0014-ai-sdk-7-native-core.md)                         | AI SDK 7 becomes the application core; the greenfield wing uses plain TypeScript and provider replacement remains the supported engine seam.                                    | Accepted                          |
| [0015](0015-native-ui-stream-tools-and-approval-profile.md)  | UI message stream v1, native tool/approval parts, and a narrow Side Chat safety profile replace the custom protocol and host-command lifecycle.                                 | Accepted                          |
| [0016](0016-workflow-durable-execution-substrate.md)         | WorkflowAgent/Postgres World is the preferred durable substrate, subject to five permanent compatibility invariants; fallback is clean ToolLoopAgent single-instance execution. | Accepted                          |
| [0017](0017-native-conversation-reconciliation.md)           | Native recovery uses atomic terminal visibility, coherent selected snapshots, a snapshot-then-changes activity barrier, and widget-lifetime live sessions.                      | Accepted                          |
| [0018](0018-terminal-projection-reconciliation.md)           | Joined Workflow activity and product-side claim fencing keep refresh, admission, and cancel truthful after crashes without restoring leases or polling.                         | Accepted                          |
