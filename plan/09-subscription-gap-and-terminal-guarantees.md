# 09 — Subscription gap fix + terminal guarantees

**Epic:** 1 Streaming | **Priority:** P0 | **Depends on:** — | **Status:** todo

## Problem

Four holes in the event-delivery invariants (all in-process; independent of the multi-instance work):

1. **Slow-consumer permanent gap:** each subscriber has a `Queue.dropping(256)` (`apps/partner-ai-service/src/adapters/persistence/turn-events/in-memory-turn-event-log.ts:37,97`). The dedupe gate is max-based (`emitIfNew` advances `maxEmitted` — `apps/partner-ai-service/src/inbound/turn-stream/turn-subscription-stream.ts:166-172`), so if seq K is dropped but K+1 is delivered, the gate advances past K; the safety poll reads only `> maxEmitted` (`:141-143`) and the widget reader checks monotonic-not-dense (`side-chat-sse-reader.ts:112`). Seq K is lost forever on that connection even though the buffer still holds it — a chunk of the answer silently vanishes.
2. **Stream ending without a terminal leaves subscribers hanging:** if the provider stream ends with no finish/error part, the drain exits *successfully*; `finalizeProtocolStream` fails validation and writes a failed *status*, but the synthetic terminal **event** is only appended on abnormal exits (`packages/partner-ai-core/src/application/stream-chat/protocol/finalization/finalize-turn-generation.ts:67-69`) — the log ends without a terminal and `takeUntil` never fires for tailing subscribers.
3. **Abort-after-complete race appends a second terminal:** interrupt landing after `sidechat.completed@N` is appended but before the drain returns → abnormal finalize appends a second terminal at N+1 and marks the turn `user_aborted` — and the assistant message the user watched complete is never persisted. The in-memory `appendEvent` has no second-terminal guard (the deleted partial-unique DB index used to do this — `in-memory-turn-event-log.ts:64-76`).
4. **Swallowed read failures:** `readEventsAfter` catches all causes and returns `[]` (`turn-subscription-stream.ts:157`) — converts real failures into silent empty replays.

## Decided approach

1. **Dense gate:** the tail emits only `seq === maxEmitted + 1`; on receiving a higher seq, re-read the log from `maxEmitted` (the buffer holds everything for a live turn) and emit the suffix in order. Keep the safety poll as the backstop.
2. **Synthetic terminal on the success path too:** when success-path finalization finds no terminal in the accumulator, append the synthetic terminal (reuse `appendSyntheticTerminal`) before/with the failed status write, so the event log always ends terminally.
3. **Terminal guard in `appendEvent`:** once a terminal is recorded for a turn, refuse further appends (typed error, logged); finalize skips the abnormal path when the accumulator already holds a terminal — completed wins over a late interrupt, and the assistant message persists.
4. `readEventsAfter`: log the cause (keep returning `[]` to avoid failing the stream, but never silently).

## Tasks

1. Read `turn-subscription-stream.ts` (gate, poll, merge), `in-memory-turn-event-log.ts`, `finalize-turn-generation.ts`, `protocol-terminal-lifecycle.ts:74-98`, `protocol-event-accumulator.ts`.
2. Implement the dense gate with re-read-on-gap; unit test: force-drop an offer (stub queue full), assert the subscriber still receives every sequence in order.
3. Success-path synthetic terminal; test: drain ends with no terminal → subscribers receive exactly one synthetic `sidechat.error`, status matches.
4. Terminal guard + completed-beats-interrupt finalize; test: interrupt after completed@N → one terminal, status `completed`, assistant message persisted.
5. Log swallowed read causes.

## Acceptance criteria

- [ ] A subscriber with a full queue never has a permanent hole (dense-gap unit test green).
- [ ] Every turn's event log ends with exactly one terminal on all exit shapes: success, no-terminal success, failure, interrupt, interrupt-after-complete.
- [ ] Interrupt-after-complete persists the assistant message and reports `completed`.

## Verification

```sh
npm test -- turn-subscription-stream
npm test -- finalize-turn-generation
npm test -- in-memory-turn-event-log
npm run verify
```
