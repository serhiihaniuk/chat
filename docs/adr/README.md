# Architecture Decision Records

Read this when: you want the accepted architecture decisions and the reasons behind them.
Source of truth for: the current ADR index, numbering, status, and format rule.
Not source of truth for: runtime mechanics (see [../architecture/](../architecture/)) or domain vocabulary (see [../domain/vocabulary.md](../domain/vocabulary.md)).

An Architecture Decision Record captures one significant, hard-to-reverse
decision: the context that forced it, the chosen boundary, rejected
alternatives, and accepted consequences. ADRs explain _why_; current
architecture and operations documents explain _how_.

The set was rebaselined on 2026-07-16 after the pre-alpha AI SDK 7 and Workflow
cutover. Fully superseded Effect, custom-protocol, connection-bound streaming,
lease-sweep, and host-command relay records were deleted because git history
already preserves them. The surviving decisions are numbered contiguously from
`0001` and describe only the retained architecture.

From this baseline onward, add a new ADR when a decision changes. Do not keep a
superseded architecture in this directory as if it were an active option.

| ADR                                                          | Decision                                                                                                                                        | Status   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| [0001](0001-no-owned-host-app.md)                            | The repository ships no production host app; host integration is the bridge contract plus runnable harness fixtures.                            | Accepted |
| [0002](0002-readable-declarative-config.md)                  | Each deployment variant is a standalone, deliberately repetitive, human-readable TypeScript configuration.                                      | Accepted |
| [0003](0003-observability-channels-and-console-first-dev.md) | Operational diagnostics and bounded product telemetry are separate, content-free, fail-open channels with console-first local defaults.         | Accepted |
| [0004](0004-widget-architecture.md)                          | The widget is iframe-first, provider-free, FSD-structured, and owns visible conversation state independently from disposable transport readers. | Accepted |
| [0005](0005-governance-harness.md)                           | Architecture, readability, documentation, dependency, and gate wiring rules are executable rather than conventional.                            | Accepted |
| [0006](0006-ai-sdk-7-native-core.md)                         | AI SDK 7 owns the agent, message, tool, approval, and transport vocabulary; Side Chat owns product policy and safe boundaries.                  | Accepted |
| [0007](0007-native-ui-stream-tools-and-approval-profile.md)  | The public stream uses native UI-message parts plus a narrow Side Chat safety profile and durable client/server-tool policy.                    | Accepted |
| [0008](0008-workflow-durable-execution-substrate.md)         | WorkflowAgent and Postgres World provide durable execution, recovery, waits, and replay behind exact pins and compatibility tests.              | Accepted |
| [0009](0009-native-conversation-reconciliation.md)           | Atomic finalization, coherent snapshots, and snapshot-then-changes activity keep browser conversation state truthful.                           | Accepted |
| [0010](0010-terminal-projection-reconciliation.md)           | Effective activity and product-side claim fencing reconcile terminal Workflow state without lease heartbeats or age-based death detection.      | Accepted |
| [0011](0011-public-server-framework-and-adoption-surface.md) | A side-effect-free server framework package owns adopter contracts while the deployable app keeps proven app-local Workflow entrypoints.        | Accepted |
