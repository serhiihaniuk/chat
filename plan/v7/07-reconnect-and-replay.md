# Step 07: Reconnect, Replay, and Multi-Subscriber Streaming

Read this when: implementing stream reattachment and multi-client delivery. `[workflow-branch]` step; on the fallback branch it shrinks to disconnect-semantics tests only.

Source of truth for: the GET stream route, `startIndex` semantics, replay correctness, and the coalescing decision.

Not source of truth for: run discovery queries (Step 10) or widget reconnect wiring (Step 16).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 05, 06, 10. Unblocks: Steps 13, 16.

## Outcome

Any authorized client can attach to an in-flight or recently finished run and receive a coherent, exactly-once-per-part stream: replay from `startIndex`, then live tail. Multiple simultaneous subscribers receive identical ordered chunks. `[fallback]`: documented request-bound semantics with tests proving disconnect leaves a durable terminal via the server-side finish handler.

## Target design `[workflow-branch]`

- Route: `GET /api/chat/:runId/stream?startIndex=N` → auth/tenancy → verify ownership through Step 10's run-discovery repository → `getRun(runId).getReadable({ startIndex })` piped through the same transform chain as POST. Do not add a temporary direct database lookup or second ownership path.
- `startIndex` semantics verified on the pinned version: 0 = full replay; negative offsets (the transport's `initialStartIndex: -50` pattern) — verify and record actual behavior; beyond-end → verify (empty replay + live tail or immediate close) and record.
- Replay repair: the client-side `normalize-ui-message-stream` layer handles step-restart duplicates; server-side we do not dedupe — but we test that a simulated re-emitted prefix (crash/replay artifact) normalizes to coherent client output.
- **Coalescing decision**: use Step 02b's retained measurements plus an explicit capacity/write-budget target. If needed, implement the transform in front of the writable—merge consecutive `text-delta`s within `settings.coalesce.windowMs`, preserving part boundaries, reasoning/text separation, and flush-on-nontext. Re-measure rows/turn in the permanent suite.

## Edge cases (each a test)

1. reconnect mid-generation → prefix replay + live tail, each part exactly once;
2. two subscribers concurrently → identical ordered chunks on both;
3. subscribe after terminal → full replay then clean close;
4. `startIndex` past the end → the verified behavior, asserted;
5. ownership violation → rejected without revealing run existence (404 vs 403 decision recorded);
6. client disconnect mid-replay → server resources for that subscriber released (no leaked readers — probe via handle counts in the harness);
7. simulated step-restart duplicate prefix → normalized client output has no duplicated text;
8. coalescing on: part boundaries and reasoning separation preserved; rows/turn reduced to the recorded target.

## Verification

```powershell
npm test -- apps/side-chat-service/src/http
npm run typecheck
npm run lint:custom
```

Record before/after rows-per-turn if coalescing was implemented.

## Completion checklist

- [ ] GET route with ownership checks and the full transform chain.
- [ ] `startIndex` semantics verified and recorded (incl. negative and past-end).
- [ ] All 8 edge cases tested (fallback: the reduced disconnect set).
- [ ] Coalescing decision executed and measured, or explicitly skipped with Step 02b measurements and the capacity target cited.

## Handoff record

Route + modules: pending

startIndex findings: pending

Coalescing outcome and measurements: pending
