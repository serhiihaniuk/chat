# 04 — Resume GET: fail fast on non-owner + stop creating ghost registry entries

**Epic:** 1 Streaming | **Priority:** P0 | **Depends on:** 02 | **Status:** todo

## Problem

Three defects in `GET /chat/turns/:id/stream` against a turn this instance doesn't own or that has ended oddly:

1. **Silent hang on non-owner:** the route only fails closed (`replay_expired`) for _terminal_ turns (`apps/partner-ai-service/src/inbound/http/routes/chat/turns/chat-turns.ts:97-104`). For a _running_ turn with no local registry entry it opens SSE against an empty buffer and hangs forever.
2. **Ghost entries:** `subscribe` calls `ensureTurn`, creating a permanent empty non-terminal registry entry for any turn this instance doesn't own (`apps/partner-ai-service/src/adapters/persistence/turn-events/in-memory-turn-event-log.ts:92-99`); the sweep only reclaims _terminal_ entries (`:49-53`), so these leak for the process lifetime and flip `hasSubscribers` true, misleading the host-command resolver.
3. **Terminal turn + `after ≥ maxSequence` hangs:** turn is terminal and buffered, replay filters everything out, no tail will ever come, `takeUntil` never fires — the SSE never closes.

Also: `readReplayOffset` parses `after=` (empty string) as `0`, silently skipping seq 0, and non-numeric values as full replay (`chat-turns.ts:265-269`).

## Decided approach (ADR-0007 (docs/adr/0007-connection-bound-streaming.md))

- Running turn + `!dispatcher.hasTurn(assistantTurnId)` → **do not open SSE**; return a structured JSON error, e.g. `409 { error: "stream_unavailable", reason: "not_stream_owner" }`, added to the protocol's documented error responses. The client reaction (poll until terminal → history) is story 07.
- `subscribe` must not create registry entries — subscribing to an unknown turn returns a not-found signal to the route instead of `ensureTurn`.
- Terminal turn: if replay yields no terminal event for the requested `after` window, close the stream immediately after replay (emit nothing and end, or end right after the replayed suffix) instead of tailing.
- `readReplayOffset`: reject non-integer/empty `after` with a 400 naming the parameter.

## Tasks

1. Read `chat-turns.ts` (stream route + `readReplayOffset` + resumability helper `chat-turns-resumability.ts`), `turn-subscription-stream.ts`, `in-memory-turn-event-log.ts`.
2. Add `hasTurn` owner check to the route before opening SSE for running turns; wire the new error body into `packages/chat-protocol` error typings if client-visible.
3. Remove `ensureTurn` from the subscribe path; handle unknown-turn subscription as a typed miss.
4. Close-after-replay for terminal turns whose replay contains no terminal event.
5. Strict `after` parsing with a 400.
6. Tests: non-owner running turn → 409 (unit: route with a dispatcher stub whose `hasTurn` is false); unknown turn leaves the registry unchanged; terminal + high `after` closes promptly; `after=` and `after=abc` → 400.

## Acceptance criteria

- [ ] A stream GET for a running turn on a non-owner instance returns the structured error in <100 ms — never a hanging SSE.
- [ ] Registry size does not grow when subscribing to unknown/foreign turns (assert via the log's test surface).
- [ ] Terminal turn + `after ≥ max` returns a stream that ends immediately.
- [ ] Malformed `after` → 400 with the parameter named.

## Verification

```sh
npm test -- chat-turns
npm test -- in-memory-turn-event-log
npm run verify
```
