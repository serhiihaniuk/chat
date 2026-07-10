# ADR 0016: Workflow Is the Preferred Durable Execution Substrate

Status: accepted 2026-07-11; compatibility verdict pending Step 02b

Supersedes: ADR 0007 and ADR 0008 when the compatibility contract passes. If it fails, this ADR's defined ToolLoopAgent fallback supersedes them instead.

## Context

The current service deliberately uses connection-bound in-memory streaming plus leases and a reaper. A hard crash terminalizes the turn but loses partial output. Cross-instance result delivery requires durable rows, Postgres notifications, polling, and an owning in-memory waiter.

WorkflowAgent, Workflow DevKit, and Postgres World offer the stronger target: journaled agent steps, persisted streams, hooks, crash recovery, and continuation by any worker/instance. That removes the reason to maintain the lease/reaper, event registry, notification relay, and recovery ladder. However, self-hosted behavior depends on compiler, worker, Postgres, and cross-process cancellation properties that source inspection alone cannot prove.

## Decision

`WorkflowAgent` + Workflow DevKit + `@workflow/world-postgres` is the default execution substrate. The implementation is retained production code from its first slice; its acceptance tests remain permanent and rerun on dependency upgrades.

The Workflow substrate is accepted only if the real monorepo service proves all five invariants:

1. pinned Workflow/Nitro code builds, boots, and repeatedly completes a streamed turn;
2. a hard owner-process crash recovers the run to terminal without a new user request;
3. a second instance can continue and serve a run created by the first through shared Postgres state;
4. replay plus live tail normalizes to one coherent client message and terminal;
5. cancellation delivers a cross-process abort signal into the active provider call, stops provider work promptly, and persists a coherent cancelled terminal.

`run.cancel()` or a stop hook alone does not satisfy cancellation: Workflow documents that the underlying model/HTTP step may continue. Tests must observe provider abort directly.

## Non-gating findings

These findings require implementation or operational work but do not justify rebuilding an execution engine:

- WorkflowAgent approval integration is incomplete;
- deploy version skew requires drain/deploy discipline;
- journal write volume needs tuning, coalescing, archive, or pruning;
- Workflow telemetry or inspection is immature;
- Side Chat policy must wrap a native primitive.

## Fallback

If a load-bearing invariant fails deterministically after one bounded root-cause/remediation attempt, the new service removes Workflow-only code and dependencies and uses AI SDK 7 `ToolLoopAgent` directly.

Fallback is intentionally request-bound and single-instance for active turns. It has no crash-resume, durable replay, custom lease/reaper, custom event registry, cross-instance waiter, Effect runtime, or compatibility bridge. Native UI stream, tools, live approvals, timeouts, telemetry, provider abstraction, and the greenfield service remain.

Exactly one substrate survives Step 02b. Product modules do not carry parallel Workflow/fallback implementations behind a permanent port.

## Consequences

Workflow's at-least-once step semantics require deterministic identities and idempotency keys for every mutation. A crash during a model call may repeat cost and produce different text; reconnect normalization must hide duplicate framing but cannot make repeated model output identical. Workflow operational records are separate from the retained business record and need measured archive/prune policy.

The compatibility gate measures runtime behavior rather than architecture preference. AI SDK 7 remains the core in either outcome.
