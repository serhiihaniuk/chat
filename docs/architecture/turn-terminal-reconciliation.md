# Effective Turn Activity and Crash Recovery

Read this when: implementing, operating, or reviewing turn recovery across the
Side Chat product schema and Postgres World.
Source of truth for: effective activity, Workflow claiming, fencing, admission,
cancellation intent, reconciliation, and their concurrency rules.
Not source of truth for: ordinary turn order
([assistant-turn.md](assistant-turn.md)), journal retention
([../operations/database.md](../operations/database.md)), or decision rationale
([ADR 0010](../adr/0010-terminal-projection-reconciliation.md)).

## Durable ownership

The two schemas own different state:

| Authority                  | Owns                                                                              | Does not own                                               |
| -------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `workflow.workflow_runs`   | Execution pending/running/terminal state, durable waits, and replay               | Product history, ownership, busy policy, or browser errors |
| `sidechat.assistant_turns` | Open/terminal aggregate, messages, usage, cancel intent, and activity publication | Whether a Workflow worker is currently live                |

`assistant_turns.status = 'open'` means that product finalization is incomplete.
It never means that the provider is generating.

## Effective-state resolver

All user-facing and concurrency-sensitive paths share one database-owned
classification:

| Product  | Run id | Workflow status        | Observation     | Busy                  |
| -------- | ------ | ---------------------- | --------------- | --------------------- |
| terminal | any    | any                    | terminal        | no                    |
| `open`   | none   | n/a                    | starting        | yes during grace      |
| `open`   | bound  | `pending` or `running` | active          | yes                   |
| `open`   | bound  | terminal               | repair required | repaired before retry |
| `open`   | bound  | missing                | indeterminate   | yes during grace      |

Selected-conversation snapshots and subject activity lists return only `active`.
The service maps that internal observation to the existing browser status
`running`. It does not expose raw Workflow statuses.

The query first scopes `assistant_turns` by workspace and subject, then joins the
single run id to `workflow.workflow_runs`. It runs on the primary database so
replica lag cannot create a false missing observation.

## Workflow claim gate

The production workflow performs this sequence before provider execution:

1. Read its Workflow run id from Workflow metadata.
2. Run an idempotent database step that attempts to bind that run to the product
   turn.
3. Continue only when the product row is still `open`, has no cancellation
   request, and is either unbound or already bound to the same run.
4. Exit without creating a provider call when the row is terminal, cancelled,
   or bound to another run.
5. Create the durable cancellation hook.
6. Re-check durable cancellation intent immediately before the provider call.

The route repeats the same-id bind after `start()` returns. Either claimant may
win; a different run id can never steal the turn. This closes the crash window
between Workflow start and the route-side bind.

Fencing is product-state based. When admission or cancel terminalizes an expired
attempt, any later resilient-start execution fails step 3 and exits. Cleanup is
therefore safe without pretending that a missing Workflow row is dead.

## Admission

The database partial unique index permits one `open` turn per conversation.
Admission uses the following order:

1. Resolve the existing open slot under a row lock.
2. Return busy for active, starting-in-grace, or indeterminate-in-grace state.
3. Repair a Workflow-terminal mismatch to safe `failed`.
4. Fence and fail an expired unbound or missing attempt.
5. Publish the terminal activity notification in the repair transaction.
6. Retry the new turn insert once.

The unique index remains the race-safe final guard. Two callers cannot both
repair and replace the same slot.

## Cancellation

Cancel first proves workspace, subject, conversation, and run ownership. It then
sets `cancel_requested_at` with a compare-and-set on the open turn.

| Effective state        | Behavior                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| active                 | Deliver the custom hook; normal finalization commits `cancelled`                                                 |
| active, hook not ready | Acknowledge durable intent; the pre-provider recheck catches start races, and a later cancel retry is idempotent |
| Workflow terminal      | Repair to a safe product terminal and acknowledge                                                                |
| indeterminate          | Fence and commit product `cancelled`; a late run exits at claim                                                  |
| already terminal       | Acknowledge idempotently                                                                                         |

A service crash after the intent write cannot erase the user's request. The
Workflow pre-provider claim observes an early race; if provider execution had
already started and the route crashes before hook delivery, the client may retry
the same idempotent cancel request.

## Repair triggers and polling

Selected-conversation and catalog reads are truthful without mutating data.
Admission repairs before it needs the one-open-turn slot, and cancel repairs the
owned run before returning. Production therefore does not poll every open turn.
This keeps idle cost at zero and makes correctness independent from scheduler
cadence. A future bounded cleanup job is optional operational hygiene only.

## Concurrency invariants

- Normal finalization, repair, cancel fencing, and Workflow claim all lock or
  compare-and-set the same product row.
- Exactly one transition moves `open` to terminal and publishes its notification.
- A same-run bind is idempotent; a different-run bind is rejected.
- A Workflow-terminal `completed` row is repaired as product `failed` when the
  aggregate completion transaction is absent. Repair never invents an assistant
  message or usage.
- Pending/running Workflow rows are never failed because of age.
- Missing age is cleanup eligibility only after the claim gate exists; it is not
  evidence that the Workflow queue is empty.
- Journal pruning continues to require a product terminal, preserving evidence
  until reconciliation has committed.

## Database privileges

The runtime repository needs only:

```sql
GRANT USAGE ON SCHEMA workflow TO sidechat_runtime;
GRANT SELECT (id, status) ON workflow.workflow_runs TO sidechat_runtime;
```

Apply these grants after Postgres World creates its schema. Tests must prove the
runtime role cannot read Workflow input, output, or error columns and cannot
mutate Workflow rows.

## Required verification

Disposable-Postgres tests must prove:

1. only Workflow `pending` and `running` rows appear active;
2. a terminal Workflow row clears activity immediately and is repaired once;
3. a missing row is not displayed as running;
4. admission blocks during grace, then fences and replaces an orphan safely;
5. a late Workflow claim after fencing exits before provider execution;
6. a Workflow-side claim survives a route crash before route binding;
7. cancel intent is persisted before hook delivery and repeated cancel is idempotent;
8. a missing-run cancel fences the turn and acknowledges;
9. normal finalization racing repair produces one terminal and at most one
   assistant message;
10. least-privilege Workflow reads and indexes match the documented contract.
