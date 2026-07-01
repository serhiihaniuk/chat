# 02 — Stream from POST /chat/runs (server)

**Epic:** 1 Streaming | **Priority:** P0 | **Depends on:** 01 | **Status:** todo

## Problem

Starting a turn is two separate HTTP requests: `POST /chat/runs` (starts the fiber on instance A, returns identity JSON) then `GET /chat/turns/:id/stream` (SSE). Behind a round-robin LB the GET lands on a non-owner instance ~(N−1)/N of the time; that instance opens SSE against its empty in-memory registry and hangs forever — no data, no terminal, no error (`apps/partner-ai-service/src/inbound/http/routes/chat/turns/chat-turns.ts:97-104`, `apps/partner-ai-service/src/inbound/turn-stream/turn-subscription-stream.ts:135-157`). Multi-instance live streaming is broken by construction with the two-call design.

## Decided approach (ADR-0010)

`POST /chat/runs` runs pre-start synchronously exactly as today (auth, policy, context admission, idempotent turn insert, fork-only-when-inserted), then instead of returning identity JSON it **opens the SSE response on the same connection** and streams the turn's events to the terminal. The connection that started the turn is attached to the owning instance by construction.

Design points:

- **Turn identity must reach the client before/with the first event.** Emit it as the first SSE frame. Prefer a dedicated `sidechat.run-identity` frame OR enrich the existing `sidechat.started` event (seq 0, emitted by core at `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts:95-110`) with `requestId` + `conversationId`. Choose whichever needs fewer protocol changes; whichever is chosen, story 16's completeness test must cover it. The widget needs `assistantTurnId`, `conversationId`, `requestId` early (it persists the resume marker and adopts new conversations from these — see `packages/side-chat-widget/src/features/chat/model/use-widget-chat-actions.ts`).
- **Closing the response must NOT interrupt generation.** The fiber stays server-owned in the `FiberMap` (`apps/partner-ai-service/src/inbound/turn-runner/turn-runner.ts:77-98`); the SSE body is a subscriber, same acquire/release semantics as the current stream GET (`Effect.acquireRelease` in `turn-subscription-stream.ts:72-84`). Reuse `createTurnSubscriptionStream` — the POST route subscribes to the turn it just started (registry always local here).
- **Idempotent replay:** a duplicate `requestId` POST (not `inserted`) must ALSO return the SSE stream for the existing turn — subscribe with `after=-1`. On this instance-local design, if the duplicate lands on a non-owner instance and the turn is still running, return the same fail-fast error as story 04 (client falls back to polling).
- **Pre-start failures** keep today's JSON error responses (they happen before the stream opens) — do not convert those to SSE.
- **Error contract:** keep the response `Content-Type` decision at the last moment: JSON for pre-start failure, `text/event-stream` once the turn is started. Update `packages/chat-protocol` request/response typings if the identity frame is new protocol surface.

## Tasks

1. Read `chat-runs.ts` (current POST route), `turn-runner.ts` (`startTurn`/identity return), `turn-subscription-stream.ts`, and `apps/partner-ai-service/src/inbound/http/response/sse.ts`.
2. Implement the identity-first frame (protocol change in `packages/chat-protocol` if a new event type: update event union, validators, readers, branding, codec, schema, sequence rules — follow the checklist in story 16).
3. Rewrite the POST route: pre-start → fork (unchanged) → open SSE via the existing subscription stream with `after=-1`.
4. Keep `GET /chat/turns/:id/stream` in place (story 04 hardens it); delete any now-dead identity-JSON response helpers per the final-state rule.
5. Update `test-harness/adoption-harness/src/adoption-golden-path.test.ts` and service route tests to consume the POST stream.
6. Update the harness mock/local-service clients (`test-harness/widget-harness/src/clients/*`) minimally so tests pass — the full widget change is story 03.

## Acceptance criteria

- [ ] One `POST /chat/runs` call yields identity + all events + exactly one terminal over a single SSE response.
- [ ] Client disconnect mid-stream does not interrupt generation (test: disconnect, then poll turn status until `completed`, assert assistant message persisted).
- [ ] Duplicate `requestId` POST on the owning instance replays the same turn's stream; no second fiber (assert via existing fork-only-when-inserted tests).
- [ ] Pre-start failures still return JSON errors with today's status codes.

## Verification

```sh
npm test -- turn-runner
npm test -- chat-runs
npm run test:e2e   # after story 03 lands; until then run the adoption harness
npm run verify
```

## Docs to update

None here (story 10 owns the docs pass); update inline route comments in the same patch.
