# Effect v4 Rewrite Status Board

Read this when: choosing work, resuming an interrupted step, reviewing dependencies, or reporting program status.

Source of truth for: implementation-step state, ownership, blockers, checkpoint decisions, and verification evidence.

Not source of truth for: implementation details or architectural rationale; follow the linked step and `KNOWLEDGE.md`.

## State vocabulary

- `not_started`: no implementation work has begun.
- `in_progress`: one named owner is actively implementing or repairing the step.
- `in_review`: implementation is complete and awaits independent evidence review.
- `blocked`: a specific unresolved dependency prevents meaningful progress.
- `complete`: every exit criterion passes and required cleanup is finished.

Only one owner changes a step at a time. Reviewers may add evidence without taking ownership. A step cannot be `complete` while its required verification is skipped, its legacy path remains active, or a documented temporary bridge has no deletion owner.

## Board

| Step | State | Owner | Depends on | Unblocks | Required completion evidence |
| --- | --- | --- | --- | --- | --- |
| [01 Effect v4 baseline](./01-select-and-pin-effect-v4-baseline.md) | `not_started` | unassigned | none | all steps | exact coherent v4 versions pinned; lockfile and policy aligned; full gate passes |
| [02 Behavioral contracts](./02-freeze-behavioral-contracts.md) | `not_started` | unassigned | 01 | 03-16 | four contract-suite shells and current-behavior characterization pass |
| [03 Test substrate](./03-build-deterministic-effect-test-substrate.md) | `not_started` | unassigned | 02 | 04-16 | `@effect/vitest`, TestClock, service doubles, resource probes proven |
| [04 Failure model](./04-establish-tagged-error-and-failure-policy.md) | `not_started` | unassigned | 03 | 05-16 | tagged unions and exhaustive boundary mappers; no owned `unknown` failures |
| [05 Core Context services](./05-define-core-context-services.md) | `not_started` | unassigned | 04 | 06-16 | final service contracts and ground-up workflow exist; no mega service/compatibility adapter |
| [06 Persistence ownership](./06-own-persistence-and-promise-boundaries.md) | `not_started` | unassigned | 05 | 07-16 | atomic begin-turn adapter; Postgres/listener release and ownership tests pass |
| [07 Config, clock, ID, secrets](./07-build-config-clock-id-and-secret-services.md) | `not_started` | unassigned | 06 | 08-16 | validated settings Layer; TestClock; deterministic IDs; redacted secrets |
| [08 Layer graph and app cutover](./08-build-live-and-test-layer-graph.md) | `not_started` | unassigned | 07 | checkpoint, 09-16 | acyclic Live/Test graph; one ManagedRuntime/Hono adapter; old path deleted; real app boots |
| Architecture checkpoint | `not_started` | unassigned reviewer | 08 | 09-16 | written review against the checkpoint in `README.md`; no unresolved findings |
| [09 Background services](./09-scope-and-supervise-background-services.md) | `not_started` | unassigned | checkpoint | 10-16 | runners, reaper, listeners, and registries scoped and supervised |
| [10 Host commands](./10-rebuild-host-command-lifecycle.md) | `not_started` | unassigned | 09 | 11-16 | exactly-once resolve/poll/timeout/abort contract; resolver resource bounds |
| [11 Timeouts, retries, cancellation](./11-standardize-timeouts-retries-and-cancellation.md) | `not_started` | unassigned | 10 | 12-16 | retry matrix enforced; title/provider/lease/cancel tests use virtual time |
| [12 Capacity](./12-add-admission-and-provider-capacity.md) | `not_started` | unassigned | 11 | 13-16 | bounded admission, provider permits, host/tool bounds, overload behavior |
| [13 PubSub event fan-out](./13-rebuild-event-fanout-with-pubsub.md) | `not_started` | unassigned | 12 | 14-16 | ground-up PubSub stream service replaces custom dispatcher; replay/sequence/drop/reconciliation contract passes |
| [14 Observability](./14-add-native-observability-layers.md) | `not_started` | unassigned | 13 | 15-16 | logger/tracer/metrics Layers; privacy and cardinality tests; no dropped effects |
| [15 Node/application lifecycle](./15-finalize-node-runtime-and-application-lifecycle.md) | `not_started` | unassigned | 14 | 16 | single acquisition; NodeRuntime root; readiness/fatal race; hard-deadline shutdown proven |
| [16 Governance and deletion](./16-enforce-governance-delete-legacy-and-update-docs.md) | `not_started` | unassigned | 15 | program completion | legacy removed; gates enforce boundaries; canonical docs updated; full verification |

## Active execution log

Add newest entries first. Keep entries factual and short.

| Date | Step | Owner | Update | Evidence or blocker |
| --- | --- | --- | --- | --- |
| 2026-07-10 | program | Codex | Initial ground-up rewrite plan created. | Repository audit, installed beta.70 declarations, official v4 source clone, and npm v4 tag check informed the plan. |

## Architecture checkpoint record

Status: `not_started`

Reviewer: unassigned

Decision: pending

Required corrections: none recorded

Evidence: none recorded

## Cross-step decisions

Record a decision here only when it changes more than one remaining step. Put detailed rationale in `KNOWLEDGE.md` and link it.

| Date | Decision | Affected steps | Rationale/evidence |
| --- | --- | --- | --- |
| 2026-07-10 | Select the newest coherent Effect v4 baseline at execution time; beta.70 is not a constraint. | 01-16 | User direction; v4 API stability must be verified from the selected packages. |
| 2026-07-10 | Retain Vercel AI SDK; do not adopt Effect AI. | 02, 08, 11, 12, 15, 16 | Product decision; concentrate Effect on workflow, lifecycle, errors, concurrency, and observability. |
| 2026-07-10 | Adopt Effect PubSub for live event signals; retain the durable event log for replay/reconciliation. | 09, 13-16 | Effect owns subscriber queues, scope, shutdown, and backpressure while PostgreSQL remains durable truth. |
| 2026-07-10 | Adopt native Effect Logger, Tracer, and Metric Layers; only exporter selection is optional. | 08, 09, 11-16 | Observability is part of the runtime architecture, not a later integration choice. |
| 2026-07-10 | Prefer ground-up module replacement; do not add legacy compatibility bridges. | all implementation steps | Pre-production freedom should reduce final complexity rather than preserve old factories and shapes. |
| 2026-07-10 | Challenge and supersede ADR 0003's internal plain-port/no-Layer decision while preserving Effect containment. | 06, 08, 15, 16 | Current manual registry and shutdown plumbing prevent a coherent resource graph. |

## Blockers

None.

When blocked, record the exact missing fact, authority, upstream step, or failing command. Do not use `blocked` for work that is merely large or difficult.

## Program completion evidence

Populate this section only after Step 16.

- Selected Effect v4 baseline: pending
- Full verification command and result: pending
- Disposable integration lifecycle result: pending
- Canonical docs updated: pending
- Legacy symbol deletion search: pending
- Remaining known risks: pending
