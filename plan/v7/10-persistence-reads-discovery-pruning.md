# Step 10: Persistence — Reads, Run Discovery, and Pruning

Read this when: building history/list read paths, active-run discovery, and Workflow journal pruning.

Source of truth for: read-path contracts, drift handling, discovery, and pruning semantics.

Not source of truth for: schema/write path (Step 09).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 09. Unblocks: Steps 13, 16.

## Outcome

Clients load validated history, discover in-flight runs for reattachment, and prune completed Workflow journals through a self-healing sweep. The old HistoryMessage shape and localStorage run-marker machinery have no successor.

## Target design

### Reads

- `GET /api/conversations/:id/messages`: validate each stored `UIMessage` with current tool/data schemas. On drift, keep the stored record unchanged but return a safe projection containing only valid text parts; if none survive, return one neutral “Historical content is unavailable after an upgrade” text part. Increment telemetry with no content/id labels. Never 500 the whole list or pass unvalidated tool/data parts.
- Conversations list, models list: shapes owned by the new wing's routes; TanStack Query on the widget keeps consuming them (Step 13).
- **Run discovery**: `GET /api/conversations/:id/active-turn` → `{ turnId, runId, status }` for the newest non-terminal turn; empty after terminal. It powers fresh-tab reattachment and replaces `widget-run-marker`.

### Pruning

- A composition-root interval runs an immediate sweep at boot and then on schedule. The sweep is concurrency-safe and self-healing.
- Isolate Postgres World maintenance behind one adapter with explicit pinned-schema conformance tests when no public prune API exists.
- Never prune non-terminal runs or runs whose conversation has legal hold.
- Archive before prune when the configured compliance policy classifies workflow journals as records.

## Edge cases (each a test)

1. drift: a persisted message referencing a removed tool → degraded read per the recorded decision, telemetry counted, no 500;
2. discovery returns the running turn during generation, empty after terminal;
3. tenant isolation on history/list/discovery (two-tenant test);
4. pruning removes only terminal runs past the window;
5. the first sweep after downtime catches accumulated terminal runs;
6. concurrent sweeps are safe;
7. discovered `runId` feeds the Step 07 stream route successfully. This cross-step assertion is owned by Step 07 because that route does not exist before Step 10 unblocks it; Step 10 proves the discovery value is the exact persisted Workflow run id.

## Verification

```powershell
npm test -- apps/side-chat-service/src/application/conversations apps/side-chat-service/src/adapters/http/conversations apps/side-chat-service/src/composition/lifecycle/maintenance packages/db/src/maintenance
npm run test:db:container
npm run typecheck --workspace @side-chat/db
npm run typecheck --workspace @side-chat/side-chat-service
npx oxlint --deny-warnings apps/side-chat-service packages/db scripts/run-db-container-tests.mjs
npm run lint:custom
```

## Completion checklist

- [x] History read with drift-degrade decision implemented and tested.
- [x] Discovery endpoint live; marker machinery has no consumer in the new path.
- [x] Pruning proven as a self-healing, concurrency-safe sweep.
- [x] Step 10's six executable edge cases pass and container evidence is recorded; Step 07 owns the deferred route integration case above.

## Handoff record

Drift-degrade evidence: `read-conversation-history.test.ts` proves a removed structured part degrades only its message, keeps safe text, uses the neutral fallback when needed, records label-free telemetry, and does not fail the list.

Pruning adapter and pinned-schema evidence: `npm run test:db:container` bootstraps the installed `@workflow/world-postgres` schema and passes the maintenance integration suite for eligibility, legal hold, archive rollback, batching, and concurrent advisory locking. The service sweeper tests prove immediate catch-up, scheduled retry, and overlap protection.

Read-route shapes: authenticated `GET /api/conversations`, `GET /api/models`, `GET /api/conversations/:conversationId/messages`, and `GET /api/conversations/:conversationId/active-turn`. The last returns `{ activeTurn: { turnId, runId, status: "running" } | null }`; it exposes only a bound run and becomes null after terminal projection. Two-tenant tests cover list, history, and discovery isolation.
