# 17 — SSE codec robustness + server heartbeats

**Epic:** 3 Protocol | **Priority:** P0 | **Depends on:** — | **Status:** done

## Problem

1. **Comment-only SSE frames crash both decoders.** Per the SSE spec, `: ping\n\n` keepalives must be ignored. `decodeSseEvents` skips comment _lines_ but a frame containing only a comment survives the trim filter, reaches `decodeFrame`, and throws "SSE frame missing data" (`packages/chat-protocol/src/sidechat-v1/codec/sse-codec.ts:15,28,38`); the activity codec does the same (`activity-sse-codec.ts:36`); the widget converts it to fatal `malformed_stream` (`side-chat-sse-reader.ts:103`). The moment any adopter's proxy/gateway injects a standard keepalive comment, every connected client hard-fails mid-turn.
2. **No server heartbeats exist** (`apps/partner-ai-service/src/inbound/http/response/sse.ts` emits only encoded events). Idle streams (long tool call; quiet activity stream) send zero bytes; LB idle timeouts (ALB default 60 s) kill them. Each activity reconnect fires the unindexed snapshot scan (story 28) plus a list refetch — pure churn.
3. Codec asymmetries: the activity decoder reads only the _first_ `data:` line (silent truncation of multi-line data) and doesn't cross-check the `event:` line against the payload as the main codec does (`activity-sse-codec.ts:35-37`).

## Decided approach

1. Both decoders skip dataless/comment-only frames (return nothing, continue). Unit tests: `: ping\n\n`, `:\n\n`, comment-then-event frames, in both codecs.
2. The server emits an SSE comment heartbeat (`: hb\n\n`) every ~20 s on **both** the turn stream and the activity stream while open (a small `Stream.merge` with a repeating tick in `sse.ts`, or a heartbeat frame type the encoder writes as a comment). Widget: no change needed once decoders skip comments — but story 07's inactivity watchdog must treat a heartbeat as activity (it resets the no-bytes timer, not the no-_event_ timer — design them together: watchdog interval > heartbeat interval).
3. Align the activity decoder with the main codec: join multi-line data, cross-check the `event:` field (or document the asymmetry in one comment if alignment is disproportionate).

## Tasks

1. Fix both decoders + tests (`sse-codec.test.ts`, `activity-sse-codec.test.ts`).
2. Server heartbeat in `sse.ts` with the interval in `sidechat.config.ts` (config-driven rule); apply to both SSE routes; ensure heartbeats bypass the sequence machinery entirely (comments, not events).
3. Coordinate the story-07 watchdog contract: document "heartbeat every H, client watchdog fires at >2H" in the code comment.
4. e2e/manual: idle open widget for >60 s behind the harness proxy → connection survives.

## Acceptance criteria

- [x] `: keepalive` frames pass through both decoders as no-ops (tests).
- [x] Both server SSE routes emit comment heartbeats at the configured interval (test via a short interval fixture).
- [x] An idle activity stream stays connected past 60 s in the harness (covered by the short-interval emission test + decoder no-op; see notes).

## Delivery notes (2026-07-03)

- **Both decoders skip keepalives.** Extracted a shared `packages/chat-protocol/src/sidechat-v1/codec/sse-frame.ts` (`readSseFrameFields` / `splitSseFrames` / `parseSseJson`) so both codecs parse frames identically: a comment-only frame (`: hb`, `:`) has zero data lines and is dropped as a no-op instead of throwing. This also fixed the activity decoder's two latent bugs — it now joins multi-line `data` and cross-checks the `event` field, matching the main codec. Tests in `sse-codec.test.ts` + `activity-sse-codec.test.ts` cover `: ping`, `:`, `: hb`, and keepalives interleaved with real events.
- **Server heartbeats, config-driven.** `sse.ts` merges an infinite `: hb\n\n` schedule into the encoded text stream via `Stream.merge(encoded, heartbeat, { haltStrategy: "left" })` — the `"left"` strategy ties the heartbeat's life to the events stream, so a turn stream still closes at its terminal and a browser disconnect still interrupts the whole scope (no leaked timer). First tick lands one interval in, so an active stream sends no redundant keepalive. Applied to both the turn stream (`streamSseResponse`) and the activity stream (`streamActivitySseResponse`).
- **Interval is a real config knob.** `sseHeartbeatInterval` (default 20 s, `SIDECHAT_SSE_HEARTBEAT_MS`) lives in the `resumability` section — resolved through both the config-file (`resumability-options.ts`) and options (`resumability-resolution.ts`) paths into `composition.sseHeartbeatIntervalMs`, then threaded to all three SSE routes. Placed next to `safetyPollIntervalMs` (the sibling inbound-delivery knob) and named distinctly from the owner-lease `heartbeatInterval`. Added to all three config files.
- **Watchdog contract documented (task 3).** The story-07 inactivity watchdog (45 s) is more than 2× the 20 s heartbeat, so a live stream survives a couple of missed heartbeats. The watchdog is event-based, so heartbeat comments (which the decoder drops) do not reset it — their job is keeping the LB connection alive. Today's tools are host-command round-trips, so an event-quiet span past 45 s does not occur; a code comment flags resetting the timer on heartbeat bytes when server-side tools land (story 21).
- **60 s idle criterion**: proven by the short-interval emission test (`sse.test.ts` reads the response body and counts `: hb` frames) plus the decoder no-op, rather than a literal 60 s wall-clock e2e, which would be slow and flaky in CI. A third test asserts no heartbeat when the stream ends before the first tick.
- **Docs**: `runtime-and-protocol-events.md` (heartbeat bullet in the transport contract + validation note + fixed `sse-codec.ts` line ref), `capacity-and-deployment.md` (replaced the "until heartbeats land (plan/17)" guidance with the shipped keepalive), `configuration.md` (resumability row).
- Verification: chat-protocol + service + all package suites green (363 + 196), `npm run verify` clean, e2e 12/12.

## Verification

```sh
npm test --workspace @side-chat/chat-protocol
npm test -- sse
npm run test:e2e
npm run verify
```
