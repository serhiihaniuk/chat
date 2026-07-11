# Step 07: Reconnect, Replay, and Multi-Subscriber Streaming

Read this when: implementing durable stream reattachment and multi-client delivery.

Source of truth for: the GET stream route, `startIndex` semantics, replay correctness, and the coalescing decision.

Not source of truth for: run discovery queries (Step 10) or widget reconnect wiring (Step 16).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 05, 06, 10. Unblocks: Steps 13, 16.

## Outcome

Any authorized client can attach to an in-flight or recently finished run and receive a coherent stream: replay from `startIndex`, then live tail. Multiple simultaneous subscribers receive identical ordered chunks.

## Target design

- Route: `GET /api/chat/:runId/stream?startIndex=N` → auth/tenancy → verify ownership through Step 10's run-discovery repository → `getRun(runId).getReadable({ startIndex })` piped through the same transform chain as POST.
- Verify and record pinned `startIndex` behavior for zero, negative offsets, and beyond-end values.
- The client-side `normalize-ui-message-stream` layer repairs step-restart duplicate framing; test the complete user-visible message, not only raw chunks.
- Measure the deployed write shape (rows and round trips per turn — the Step 02 compatibility suite is the harness) and use an explicit write budget to decide whether consecutive text deltas need coalescing before durable writes.

## Edge cases (each a test)

1. reconnect mid-generation → prefix replay + live tail, each part exactly once after normalization;
2. two subscribers concurrently → identical ordered chunks on both;
3. subscribe after terminal → full replay then clean close;
4. `startIndex` past the end → verified behavior asserted;
5. ownership violation → rejected without revealing run existence;
6. client disconnect mid-replay → subscriber resources released;
7. simulated step-restart duplicate prefix → normalized output has no duplicated text;
8. coalescing, if enabled, preserves part boundaries and reasoning separation.

## Verification

```powershell
npm test -- apps/side-chat-service/src/http
npm run typecheck
npm run lint:custom
```

## Completion checklist

- [ ] GET route with ownership checks and the full transform chain.
- [ ] `startIndex` semantics verified and recorded.
- [ ] All eight reconnect/replay edge cases pass.
- [ ] Coalescing decision executed and measured or explicitly skipped.

## Handoff record

Route and modules: pending

`startIndex` findings: pending

Coalescing outcome and measurements: pending
