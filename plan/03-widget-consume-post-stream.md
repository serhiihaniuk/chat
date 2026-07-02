# 03 — Widget consumes the POST stream

**Epic:** 1 Streaming | **Priority:** P0 | **Depends on:** 02 | **Status:** todo

## Problem

The widget's send path is two calls mirroring the old server design: `createRun` (JSON identity, with retry + idempotency key — `packages/side-chat-widget/src/entities/conversation/api/run/side-chat-run-retry.ts`) then `openSubscription` → `GET /chat/turns/:id/stream` (`packages/side-chat-widget/src/features/chat/model/subscription/widget-subscription-lifecycle.ts:85`). After story 02 the POST itself is the stream.

## Decided approach

Story 02 landed (2026-07-02) with these facts this story builds on: the POST response is the SSE stream; **identity is the `sidechat.started` frame at sequence 0** (`assistantTurnId` on the envelope, `conversationId` on the event — no new protocol event, no identity JSON anywhere); a duplicate `requestId` replays the stream or returns `404 replay_expired` when the finished turn's buffer was swept; pre-start failures remain JSON errors. See `plan/02` delivery notes and the rewritten service test-support (`turn-stream-harness.test-support.ts`) for the consumption pattern.

Merge start+subscribe on the client: `createRun` returns the SSE body stream; the subscription lifecycle consumes it directly. The run store, reducer, and SSE decoding do not change — they already consume a validated event sequence (`packages/side-chat-widget/src/entities/conversation/api/sse/side-chat-sse-reader.ts` wraps the protocol codec; keep it).

Design points:

- **Identity handling:** the reducer/actions currently receive identity from the JSON response before events flow (`use-widget-chat-actions.ts` — begins run, writes marker, adopts conversation). Rework to take identity from the first frame (per story 02's choice) before dispatching subsequent events.
- **Retry semantics change:** today `createRun` retries 5xx with the same idempotency key. Keep that for failures _before any SSE frame arrives_. Once frames have arrived, mid-stream failure handling belongs to story 07 (do not retry the POST blindly — the turn may be running; story 07's poll-fallback owns it).
- **`resolveRun` on `SideChatApiClient`** (`side-chat-api-types.ts:277`) is required-but-unused today. With stream-from-POST decide its fate: keep it (it becomes genuinely useful for the poll fallback in story 07 — resolve turn by requestId after a dropped POST) and wire it, or make it optional. Prefer: keep, document, wire in story 07.
- Update `SideChatApiClient` type + both harness clients (`test-harness/widget-harness/src/clients/mock-stream-client.ts`, `local-service-client.ts`) to the new contract. Delete the old two-call client surface per the final-state rule.

## Tasks

1. Read `use-widget-chat-actions.ts`, `widget-run-controller.ts`, `widget-subscription-lifecycle.ts`, `side-chat-api-types.ts`, and both harness clients.
2. Change the api-client `createRun` to return `{ identity-from-first-frame, events: AsyncIterable<SidechatStreamEvent> }` (or a single async iterable whose first element is the identity frame — pick the shape that keeps the reader's terminal/sequence validation intact).
3. Rework `startTurn` → `beginRun` wiring so marker write + conversation adoption use the streamed identity.
4. Keep `openSubscription` for the resume path (GET) — used by stories 04/07.
5. Update all widget unit tests + harness clients; ensure the mock-stream client emits the identity frame first so mock mode matches the real protocol.

## Acceptance criteria

- [ ] Send → tokens works over the single POST in the widget-harness local-service mode.
- [ ] Marker + conversation adoption still work (existing tests in `widget-run-controller.test.tssx` / actions tests pass, updated).
- [ ] Pre-frame POST failures still retry with the same idempotency key; post-frame failures do NOT re-POST (test both).
- [ ] Mock-stream mode emits identity-first and passes the same reader validation.

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run test:e2e
npm run verify
```
