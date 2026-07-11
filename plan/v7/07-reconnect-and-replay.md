# Step 07: Reconnect, Replay, and Multi-Subscriber Streaming

Read this when: implementing durable stream reattachment and multi-client delivery.

Source of truth for: the GET stream route, `startIndex` semantics, replay correctness, and the coalescing decision.

Not source of truth for: run discovery queries (Step 10) or widget reconnect wiring (Step 16).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 05, 06, 10. Unblocks: Steps 13, 16.

## Outcome

Any authorized client can attach to an in-flight or recently finished run and receive a coherent stream: replay from `startIndex`, then live tail. Multiple simultaneous subscribers receive identical ordered chunks.

## Target design

- Route: `GET /api/chat/:runId/stream?startIndex=N` → auth/tenancy → verify ownership through Step 10's tenant-scoped run lookup → translate the public UI cursor over a bounded raw-journal scan → replay plus live tail through the same transform chain as POST.
- Verify and record pinned `startIndex` behavior for zero, negative offsets, and beyond-end values.
- The client-side `normalize-ui-message-stream` layer repairs framing and fully-ended frame redelivery; test the complete user-visible message, not only raw chunks.
- Measure the deployed write shape (rows and round trips per turn — the Step 02 compatibility suite is the harness) and use an explicit write budget to decide whether consecutive text deltas need coalescing before durable writes.

### Implementation correction

The pinned WorkflowAgent journal stores `ModelCallStreamPart`, while
WorkflowChatTransport's `startIndex` counts transformed `UIMessageChunk`s. The
transform is not one-to-one, so directly forwarding the client cursor to
`getReadable({ startIndex })` can skip content or the EOF marker. The completed
implementation scans the bounded raw prefix, resolves the public UI cursor,
then continues from the same raw reader for live tail. This keeps the public
contract exact at O(history) reconnect cost.

The pinned normalizer repairs framing and removes a redelivered fully-ended
text/reasoning frame. It does not deduplicate arbitrary repeated deltas while a
part remains open; the restart test and completion claim are intentionally
bounded to the supported fully-ended-frame overlap.

## Edge cases (each a test)

1. reconnect mid-generation → prefix replay + live tail, with one visible copy of scripted content;
2. two subscribers concurrently → identical ordered chunks on both;
3. subscribe after terminal → full replay then clean close;
4. `startIndex` past the end → verified behavior asserted;
5. ownership violation → rejected without revealing run existence;
6. client disconnect mid-replay → subscriber resources released;
7. simulated fully-ended frame redelivery → normalized output has no duplicated text;
8. coalescing, if enabled, preserves part boundaries and reasoning separation.

## Verification

```powershell
npm test -- apps/side-chat-service/src/adapters/http
npm run typecheck
npm run lint:custom
```

## Completion checklist

- [x] GET route with ownership checks and the full transform chain.
- [x] `startIndex` semantics verified and recorded.
- [x] All eight reconnect/replay edge cases pass (coalescing is conditional and was skipped).
- [x] Coalescing decision executed and measured or explicitly skipped.

## Handoff record

Route and modules: `GET /api/chat/:runId/stream`; `chat-routes.ts`, `workflow-turn-replay.ts`, `chat-turn.ts`, tenant-scoped `TurnRunAccess`, and the shared `createChatStreamResponse` chain.

`startIndex` findings: the public cursor counts UI chunks. Missing/zero starts at zero; negatives resolve against the attachment-time UI tail and clamp to zero; `tail + 1` is a valid empty tail; `> tail + 1` returns `416`. Unknown, foreign, and pruned runs all return hidden `404`. The pinned worlds can hang when their raw cursor skips EOF, so the route never forwards the public cursor directly.

Coalescing outcome and measurements: skipped. The compiled scripted happy turn measured 6 data rows plus one EOF row. With the pinned Postgres writer's awaited per-part flush, that is 14 SQL calls (one insert and one `pg_notify` per row), below the explicit compatibility-turn budget of 16 rows / 32 SQL calls. The measured turn has one text delta, so coalescing would save no write; a correct bounded live coalescer cannot be inserted ahead of WorkflowAgent's special writable without replacing vendor execution internals. Capacity Step 19 must re-measure representative real-provider turns before changing latency or cursor granularity.
