# 27 — Persistence races, fiber observability, fail-open telemetry

**Epic:** 5 Robustness | **Priority:** P0 | **Depends on:** 05 (reaper is the backstop) | **Status:** todo

## Problem

1. **`appendMessage` sequence race → raw 500, or a stranded turn.** It computes `coalesce(max(sequence_index),-1)+1` with a plain SELECT inside a READ COMMITTED transaction (`packages/db/src/repositories/postgres-drizzle/records/conversations.ts:89-118`); concurrent appends to one conversation compute the same index; the loser violates `messages_conversation_sequence_uq` and — because `onConflictDoNothing` targets only the idempotency index — escapes as an unhandled pg `23505`. At pre-start that's a 500. At **completion** it's worse: the assistant-message append runs inside the `onExit` finalizer (`service-persistence.ts:121-145`); if it throws, the finalizer fails, **nobody observes it** (fibers live in a FiberMap nobody joins; `awaitTurn` deliberately ignores outcomes — `turn-runner.ts:174-177`), the status write never happens, and the turn strands `running` with its finished answer lost (reaper eventually terminalizes it, but the answer is gone).
2. **A retried new-conversation POST mints an orphan and returns the wrong id.** With no `conversationId`, each attempt mints a fresh conversation (the conversation key IS the fresh fallback id — `service-conversation-persistence.ts:23-29`), so the idempotency key never dedupes conversations; and the returned identity reads `turn.conversation` from *this attempt's* prepare, not the winning turn record (`turn-runner.ts:160-165`) — the widget adopts and persists the orphan's conversationId.
3. **No guard against two concurrent runs in one conversation** (nothing consults `findActiveAssistantTurn` at pre-start) — two tabs interleave freely; combined with (1) this is the realistic 500 trigger.
4. **Telemetry is fail-closed:** `recordStreamObservationEffect` maps sink failures into the workflow error channel (`partner-ai-core/.../observability/stream-chat-observability.ts:16-20`); a flaky observability sink (an advertised seam) rejects user requests at pre-start and aborts healthy generations mid-stream (it runs on every runtime event — `protocol-event-stream.ts:185`). Title generation already swallows its sink errors — the correct model.
5. 500s leak raw `Error.message` (driver detail) to the browser (`chat-runs.ts:100` via `protocol-errors.ts:41-42`).

## Decided approach

1. `appendMessage`: `SELECT … FOR UPDATE` on the conversation row before computing max (the tx already touches it for `updatedAt`), or catch `23505` on the sequence index and retry once — pick FOR UPDATE (simpler reasoning); map any residual conflict into the typed `DbRepositoryError` surface. Add a two-concurrent-appends contract test (container lane).
2. **Observe fiber exits:** the turn-runner registers an observer on each forked fiber logging non-interrupt failures (including finalizer failures) with turn id — a DB blip during finalization becomes a loud log + reaper-recovered turn instead of silence.
3. **New-conversation idempotency:** derive the conversation key deterministically from `requestId` for conversationless requests so a retry converges on one conversation; return `conversationId` from the resolved turn record, not the current attempt's prepare.
4. **Concurrent-turn policy:** reject a second run for a conversation with an active turn (`409 conversation_busy`, checked at pre-start after the idempotent turn insert resolves). Widget already self-serializes; this guards other tabs/clients. (Reject, don't queue — simplest honest behavior; the widget maps it to a notice.)
5. Telemetry fail-open: `recordStreamObservationEffect` logs-and-continues like the title path; delete the "keep errors typed" fail-closed wiring; document on the sink port that sink failures cannot affect turns.
6. Generic 500 body ("internal error" + requestId), real message to the log only.

## Acceptance criteria

- [ ] Two concurrent `appendMessage` to one conversation both succeed with distinct sequence indexes (container test).
- [ ] A finalizer failure is logged with turn id (unit test with a failing persistence port) and the turn is reaped later (integration with story 05).
- [ ] A retried conversationless POST yields ONE conversation and the returned id matches it (test).
- [ ] Second concurrent run in one conversation → 409; widget shows a sane notice (harness test).
- [ ] A throwing observability sink no longer fails requests or streams (core test flips from fail-closed to fail-open).
- [ ] No raw error messages in 5xx bodies (route test).

## Verification

```sh
npm test --workspace @side-chat/partner-ai-core
npm test --workspace @side-chat/partner-ai-service
npm run test:db:container
npm run verify
```
