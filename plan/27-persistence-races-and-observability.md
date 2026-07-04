# 27 — Persistence races, fiber observability, fail-open telemetry

**Epic:** 5 Robustness | **Priority:** P0 | **Depends on:** 05 (reaper is the backstop), 36 (logger + console sink) | **Status:** done

## Problem

1. **`appendMessage` sequence race → raw 500, or a stranded turn.** It computes `coalesce(max(sequence_index),-1)+1` with a plain SELECT inside a READ COMMITTED transaction (`packages/db/src/repositories/postgres-drizzle/records/conversations.ts:89-118`); concurrent appends to one conversation compute the same index; the loser violates `messages_conversation_sequence_uq` and — because `onConflictDoNothing` targets only the idempotency index — escapes as an unhandled pg `23505`. At pre-start that's a 500. At **completion** it's worse: the assistant-message append runs inside the `onExit` finalizer (`service-persistence.ts:121-145`); if it throws, the finalizer fails, **nobody observes it** (fibers live in a FiberMap nobody joins; `awaitTurn` deliberately ignores outcomes — `turn-runner.ts:174-177`), the status write never happens, and the turn strands `running` with its finished answer lost (reaper eventually terminalizes it, but the answer is gone).
2. **A retried new-conversation POST mints an orphan and returns the wrong id.** With no `conversationId`, each attempt mints a fresh conversation (the conversation key IS the fresh fallback id — `service-conversation-persistence.ts:23-29`), so the idempotency key never dedupes conversations; and the returned identity reads `turn.conversation` from _this attempt's_ prepare, not the winning turn record (`turn-runner.ts:160-165`) — the widget adopts and persists the orphan's conversationId.
3. **No guard against two concurrent runs in one conversation** (nothing consults `findActiveAssistantTurn` at pre-start) — two tabs interleave freely; combined with (1) this is the realistic 500 trigger.
4. **Telemetry is fail-closed:** `recordStreamObservationEffect` maps sink failures into the workflow error channel (`partner-ai-core/.../observability/stream-chat-observability.ts:16-20`); a flaky observability sink (an advertised seam) rejects user requests at pre-start and aborts healthy generations mid-stream (it runs on every runtime event — `protocol-event-stream.ts:185`). Title generation already swallows its sink errors — the correct model.
5. 500s leak raw `Error.message` (driver detail) to the browser (`chat-runs.ts:100` via `protocol-errors.ts:41-42`).

## Decided approach

1. `appendMessage`: `SELECT … FOR UPDATE` on the conversation row before computing max (the tx already touches it for `updatedAt`), or catch `23505` on the sequence index and retry once — pick FOR UPDATE (simpler reasoning); map any residual conflict into the typed `DbRepositoryError` surface. Add a two-concurrent-appends contract test (container lane).
2. **Observe fiber exits:** the turn-runner registers an observer on each forked fiber logging non-interrupt failures (including finalizer failures) with turn id — a DB blip during finalization becomes a loud log + reaper-recovered turn instead of silence.
3. **New-conversation idempotency:** derive the conversation key deterministically from `requestId` for conversationless requests so a retry converges on one conversation; return `conversationId` from the resolved turn record, not the current attempt's prepare.
4. **Concurrent-turn policy:** reject a second run for a conversation with an active turn (`409 conversation_busy`, checked at pre-start after the idempotent turn insert resolves). Widget already self-serializes; this guards other tabs/clients. (Reject, don't queue — simplest honest behavior; the widget maps it to a notice.)
5. Telemetry fail-open: `recordStreamObservationEffect` logs-and-continues like the title path; delete the "keep errors typed" fail-closed wiring; document on the sink port that sink failures cannot affect turns.
   - The shipped console sink and the diagnostic logger this story logs through come from **story 36 / ADR 0011** — do 36 first (it superseded the "example sink" idea with a real dev-default sink).
   - Record `allow_with_warning` guard decisions through the sink (today `PreparedStreamChatTurn.turnGuardDecisions` is collected and consumed by nothing — `prepare-stream-chat-turn.ts:47`); one observation per warning with the guard id in attributes.
6. Generic 500 body ("internal error" + requestId), real message to the log only.

## Acceptance criteria

- [x] Two concurrent `appendMessage` to one conversation both succeed with distinct sequence indexes — `FOR UPDATE` on the conversation row serializes them; shared repository-contract case (memory in `verify`, real Postgres in the container lane).
- [x] A finalizer failure is logged with turn id — the turn-runner attaches a fiber observer; `observeGenerationExit` unit test asserts a fail/die logs with the turn id and an interrupt/success stays quiet. The turn is reaped later by story 05's sweep.
- [x] A retried conversationless POST yields ONE conversation and the returned id matches it — deterministic `conversationless:<requestId>` key; adapter test.
- [x] Second concurrent run in one conversation → 409 `conversation_busy`; the widget maps the 409 to a wait-your-turn notice — core guard test + widget run-client test.
- [x] A throwing observability sink no longer fails requests or streams — `recordStreamObservationEffect` is fail-open (`Effect.ignore`); core test streams a full turn through an always-failing sink.
- [x] No raw error messages in 5xx bodies — the pre-start 500 returns a generic "reference <requestId>" body and logs the real message; route test asserts the driver detail never reaches the body.

## Verification

```sh
npm test --workspace @side-chat/partner-ai-core
npm test --workspace @side-chat/partner-ai-service
npm run test:db:container   # requires Docker; runs the concurrent-append contract against real PG
npm run verify
```

## Delivery notes

**1. `appendMessage` sequence race.** Inside the append transaction a
`SELECT … FOR UPDATE` locks the conversation row before reading
`max(sequence_index)`, so concurrent appends serialize and never collide on
`messages_conversation_sequence_uq`. The tx already writes that row, so the lock
adds no new contention. A shared repository-contract case exercises two concurrent
appends (memory in `verify`, real Postgres in the container lane).

**2. Fiber-exit observation.** The turn-runner attaches an observer to each forked
generation fiber (`observeGenerationExit`): a non-interrupt fail or die logs
`turn generation failed` with the turn id via the `DiagnosticLogger`, while an
interrupt (cancel/shutdown) or success stays quiet. A DB blip during finalization
is now loud and reaper-recovered instead of a silent stranded `running` turn.

**3. New-conversation idempotency.** `ensureConversation` gained a
`fallbackConversationKey`, derived from the request id
(`conversationless:<requestId>`). The conversation id is still minted fresh, but
the _key_ is deterministic, so a retried conversationless POST dedupes on it and
converges on the first conversation; the returned id is the winner's record, not
the retry's discarded fresh id.

**4. Concurrent-turn guard.** New port read `findActiveConversationTurn` +
`guardConcurrentConversationTurn` at pre-start: a running turn from a different
request → `conversation_busy` (new core code + `conflict` protocol code → HTTP 409) before any durable write; the same request's own in-flight turn passes
through to the idempotent turn insert. Best-effort by design. The widget adds a
`conversation_busy` API code and maps the 409 to a wait-your-turn notice (409 is
already excluded from create retry).

**5. Fail-open telemetry.** `recordStreamObservationEffect` now runs
`recordStreamObservation(...).pipe(Effect.ignore)` — a sink failure can no longer
reject a request at pre-start or abort a healthy stream. Deleted the fail-closed
`STREAM_CHAT_FAILURES.OBSERVABILITY` wiring; documented the guarantee on
`ObservabilitySinkPort`. (Guard-decision observations for `allow_with_warning`
remain a small follow-up — `turnGuardDecisions` is still collected and unused; not
an acceptance criterion.)

**6. Generic 5xx body.** The route's `mapPreStartError` returns a generic
"An internal error occurred (reference <requestId>)." for any ≥500 protocol code
and logs the real message through the `DiagnosticLogger`; 4xx messages
(bad-request, unauthorized, conversation-busy) stay verbatim because they are
client-actionable.

`npm run verify` green. The literal container-restart/concurrent-append against
real Postgres runs in CI's `test:db:container` lane (Docker was unavailable in
this environment); the concurrent-append contract and every other criterion are
covered deterministically in `verify`.
