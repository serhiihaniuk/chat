# Step 10: Persistence — Reads, Run Discovery, Pruning

Read this when: building the history/list read paths, active-run discovery, and the run-log pruning job.

Source of truth for: read-path contracts, drift handling, discovery, and pruning semantics.

Not source of truth for: schema/write path (Step 09).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 09. Unblocks: Steps 13, 16.

## Outcome

Clients load validated history, discover in-flight runs for reattachment, and completed runs' replay logs are pruned by a self-healing sweep. The old HistoryMessage shape and localStorage run-marker machinery have no successor — these reads replace them.

## Target design

### Reads

- `GET /api/conversations/:id/messages`: validate each stored `UIMessage` with current tool/data schemas. On drift, keep the stored record unchanged but return a safe projection containing only valid text parts; if none survive, return one neutral “Historical content is unavailable after an upgrade” text part. Increment telemetry with no content/id labels. Never 500 the whole list or pass unvalidated tool/data parts.
- Conversations list, models list: shapes owned by the new wing's routes; TanStack Query on the widget keeps consuming them (Step 13).
- **Run discovery**: `GET /api/conversations/:id/active-turn` → `{ turnId, runId?, status }` for the newest non-terminal turn; empty after terminal. Powers fresh-tab reattachment `[workflow-branch]`; replaces `widget-run-marker`.

### Pruning `[workflow-branch]`

- A composition-root interval runs an immediate sweep at boot and then on schedule on every instance. The sweep is concurrency-safe and self-healing; Workflow has no built-in cron scheduler, so do not create a permanently sleeping scheduling workflow.
- The pinned Workflow version exposes no public run-prune API: use one isolated Postgres World maintenance adapter with explicit table/version conformance tests. A dependency bump must fail those tests until the adapter is reverified.
- **Sweep, not hook**: stateless query over durable state — self-heals after downtime (first sweep catches the whole backlog), safe under concurrent execution from two instances (idempotent deletes). Never touches a non-terminal run (suspended approval waits are non-terminal), and never touches runs whose conversation carries the legal-hold flag (Step 09).
- **Regulated variant (archive-then-prune)**: where compliance classifies journals as records (`KNOWLEDGE.md` §Regulated), the sweep exports completed runs' journal/chunk data to the configured immutable archive target before deleting from the hot tables. Chunk deletion after the reconnect grace window remains justified either way by the Step 09 message-equals-stream equality test (the assembled record is provably equivalent; chunks are transport artifacts).

## Edge cases (each a test)

1. drift: a persisted message referencing a removed tool → degraded read per the recorded decision, telemetry counted, no 500;
2. discovery returns the running turn during generation, empty after terminal;
3. tenant isolation on history/list/discovery (two-tenant test);
4. pruning removes only terminal runs past the window; a suspended run is never pruned;
5. catch-up after downtime: terminal runs accumulated while the job wasn't running are all pruned in the first sweep;
6. concurrent sweeps from two instances are safe;
7. discovery + reconnect integration: discovered `runId` feeds the Step 07 GET route successfully (cross-step integration test).

## Verification

```powershell
npm test -- apps/side-chat-service/src/persistence
npm test -- apps/side-chat-service/src/http
npm run test:db:container
npm run typecheck
npm run lint:custom
```

## Completion checklist

- [ ] History read with drift-degrade decision implemented and tested.
- [ ] Discovery endpoint live; marker machinery has no consumer in the new path.
- [ ] Pruning proven as a self-healing, concurrency-safe sweep.
- [ ] All seven edge cases pass; container evidence recorded.

## Handoff record

Drift-degrade evidence: pending

Pruning adapter and pinned-schema evidence: pending

Read-route shapes: pending
