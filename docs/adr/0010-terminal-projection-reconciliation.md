# ADR 0010: Derive Effective Turn Activity and Fence Orphaned Workflow Attempts

Status: accepted 2026-07-15

Clarifies: ADR 0008 (Workflow durable execution substrate) and ADR 0009
(native conversation reconciliation).

This decision does not restore lease heartbeats or age-based death detection.

## Context

Workflow and Side Chat persist different durable facts. Postgres World owns run
existence, execution state, waits, and replay. The `sidechat` schema owns the
product aggregate: message history, usage, safe terminal metadata, activity
notifications, and the one-open-turn conversation guard.

The original product status named `running` mixed those responsibilities. It
meant both "the product aggregate has not committed a terminal" and "Workflow is
currently executing." A production incident exposed the contradiction: a
Workflow run failed before the application finalizer loaded, while the product
row remained `running` for more than ten hours. Refresh and the catalog trusted
that product row, and cancel tried to resume a hook that no longer existed.

A periodic repair alone does not make reads truthful between sweeps. A missing
Workflow row is also not terminal evidence. Workflow can queue resilient-start
input before its run row is visible, then materialize that run later. Side Chat
must therefore prevent a late run from executing before it releases an orphaned
product slot.

## Decision

Use a split-authority model with one database-owned effective-state resolver.

1. Product persistence stores `open` or a terminal status. `open` means the
   aggregate has not committed a terminal; it does not claim execution liveness.
2. Workflow `pending` or `running` is the only evidence that a bound execution is
   active.
3. Selected-conversation reads, subject activity snapshots, admission, and
   cancel use the same indexed cross-schema classification.
4. The resolver runs against the primary database. It scopes the product row by
   workspace and subject before inspecting the Workflow run.
5. Every Workflow execution performs an idempotent product claim before creating
   a provider call. The claim binds the current Workflow run id and succeeds only
   while the product turn is still `open` and has no cancellation request.
6. A terminalized or superseded product row fences a late Workflow run. The run
   exits before provider execution and cannot resurrect the old turn.
7. The route-side bind remains an idempotent duplicate of the Workflow claim. It
   is not the only binding path, so a route crash cannot lose the run identity.
8. Cancel first persists `cancel_requested_at`. A live run receives the durable
   cancellation hook; a not-yet-materialized run is fenced and may be marked
   cancelled because any later execution must pass the product claim.
9. Correctness does not depend on polling. Reads derive activity immediately;
   admission and cancel repair the locked product row when they need to mutate
   it. A future bounded cleanup job may reduce dormant `open` rows, but it must
   reuse this resolver and cannot become the activity authority.

The product schema also records `run_bound_at` independently from `started_at`.
The former measures the route or Workflow claim; the latter remains product
history.

## Effective state

The resolver uses this table:

| Product  | Binding | Workflow               | Effective state |
| -------- | ------- | ---------------------- | --------------- |
| terminal | any     | any                    | terminal        |
| `open`   | none    | n/a                    | starting        |
| `open`   | bound   | `pending` or `running` | active          |
| `open`   | bound   | terminal               | repair required |
| `open`   | bound   | missing                | indeterminate   |

Only `active` becomes the browser-facing `running` state. `starting` and
`indeterminate` retain the database busy guard during their bounded grace
periods but never publish a false running hint.

After a grace expires, the application may terminalize a starting or
indeterminate turn only because the Workflow claim gate fences any later run. It
does not infer that the Workflow queue is empty.

## Admission and cancellation

Admission resolves and locks the existing open slot before rejecting a new turn.
An active or in-grace attempt remains busy. A Workflow-terminal mismatch or an
expired fenced attempt is repaired transactionally, publishes one identity-only
activity notification, and permits exactly one retry of the insert. The partial
unique index remains the final concurrency guard.

Cancellation is an application-owned durable intent:

- live execution: persist intent, deliver the hook, and let normal Workflow
  finalization commit `cancelled`;
- hook not ready: acknowledge the persisted intent; the Workflow-side second
  claim catches the start race, while a later client cancel retry is idempotent;
- Workflow terminal: repair the missing product terminal and acknowledge;
- Workflow missing: persist intent, fence the product row, commit `cancelled`,
  and acknowledge;
- already terminal: acknowledge idempotently.

Side Chat continues to use its custom hook plus abort stream. External
`run.cancel()` is not an acceptable substitute because engine cancellation does
not prove that the provider call was interrupted.

## Performance and privileges

The active working set is the partial set of product rows whose status is
`open`. Each classification performs a primary-key lookup on
`workflow.workflow_runs`; it never scans history and never performs one Workflow
API call per conversation.

The Side Chat runtime principal receives `USAGE` on the `workflow` schema and
column-level `SELECT (id, status)` on `workflow.workflow_runs`. It receives no
Workflow input, output, error, or mutation privilege. These grants are applied
after Postgres World bootstrap so a missing vendor schema fails setup loudly.

## Alternatives rejected

- **Periodic reconciliation only.** It leaves refresh, cancel, and admission
  incorrect until the next sweep.
- **Read-time derivation only.** It fixes the indicator but leaves the unique
  product slot and terminal notification stale.
- **Foreign keys or check constraints.** A foreign key proves existence, not
  liveness; a check constraint cannot inspect another table. Both conflict with
  resilient start and journal pruning.
- **Triggers on Workflow tables.** They couple vendor terminalization and upgrades
  to product writes and can make Workflow availability depend on Side Chat.
- **Workflow as the only durable authority.** Product message, usage, ownership,
  legal-hold, notification, and atomic finalization contracts still require a
  product aggregate.
- **Age-based missing-run failure without fencing.** A queued resilient-start run
  could materialize after the product slot was released and execute concurrently
  with its replacement.

## Consequences

- Refresh and catalog activity reflect Workflow liveness immediately.
- A route or service crash cannot leave a false running indicator indefinitely.
- A late resilient-start run cannot execute after its product attempt is fenced.
- Cancel intent is durable and repeated requests are idempotent. A crash after
  the intent write but before delivery may require the client to retry when the
  provider was already executing.
- Product code gains a small explicit state resolver and Workflow claim step;
  this replaces the ambiguous `running` projection rather than adding another
  liveness flag.
- Verification requires disposable Postgres coverage for joined reads, binding
  races, fencing, cancel delivery, terminal repair, least-privilege grants, and
  the one-open-turn index.
