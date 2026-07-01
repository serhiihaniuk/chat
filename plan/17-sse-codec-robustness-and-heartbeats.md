# 17 — SSE codec robustness + server heartbeats

**Epic:** 3 Protocol | **Priority:** P0 | **Depends on:** — | **Status:** todo

## Problem

1. **Comment-only SSE frames crash both decoders.** Per the SSE spec, `: ping\n\n` keepalives must be ignored. `decodeSseEvents` skips comment *lines* but a frame containing only a comment survives the trim filter, reaches `decodeFrame`, and throws "SSE frame missing data" (`packages/chat-protocol/src/sidechat-v1/codec/sse-codec.ts:15,28,38`); the activity codec does the same (`activity-sse-codec.ts:36`); the widget converts it to fatal `malformed_stream` (`side-chat-sse-reader.ts:103`). The moment any adopter's proxy/gateway injects a standard keepalive comment, every connected client hard-fails mid-turn.
2. **No server heartbeats exist** (`apps/partner-ai-service/src/inbound/http/response/sse.ts` emits only encoded events). Idle streams (long tool call; quiet activity stream) send zero bytes; LB idle timeouts (ALB default 60 s) kill them. Each activity reconnect fires the unindexed snapshot scan (story 28) plus a list refetch — pure churn.
3. Codec asymmetries: the activity decoder reads only the *first* `data:` line (silent truncation of multi-line data) and doesn't cross-check the `event:` line against the payload as the main codec does (`activity-sse-codec.ts:35-37`).

## Decided approach

1. Both decoders skip dataless/comment-only frames (return nothing, continue). Unit tests: `: ping\n\n`, `:\n\n`, comment-then-event frames, in both codecs.
2. The server emits an SSE comment heartbeat (`: hb\n\n`) every ~20 s on **both** the turn stream and the activity stream while open (a small `Stream.merge` with a repeating tick in `sse.ts`, or a heartbeat frame type the encoder writes as a comment). Widget: no change needed once decoders skip comments — but story 07's inactivity watchdog must treat a heartbeat as activity (it resets the no-bytes timer, not the no-*event* timer — design them together: watchdog interval > heartbeat interval).
3. Align the activity decoder with the main codec: join multi-line data, cross-check the `event:` field (or document the asymmetry in one comment if alignment is disproportionate).

## Tasks

1. Fix both decoders + tests (`sse-codec.test.ts`, `activity-sse-codec.test.ts`).
2. Server heartbeat in `sse.ts` with the interval in `sidechat.config.ts` (config-driven rule); apply to both SSE routes; ensure heartbeats bypass the sequence machinery entirely (comments, not events).
3. Coordinate the story-07 watchdog contract: document "heartbeat every H, client watchdog fires at >2H" in the code comment.
4. e2e/manual: idle open widget for >60 s behind the harness proxy → connection survives.

## Acceptance criteria

- [ ] `: keepalive` frames pass through both decoders as no-ops (tests).
- [ ] Both server SSE routes emit comment heartbeats at the configured interval (test via a short interval fixture).
- [ ] An idle activity stream stays connected past 60 s in the harness.

## Verification

```sh
npm test --workspace @side-chat/chat-protocol
npm test -- sse
npm run test:e2e
npm run verify
```
