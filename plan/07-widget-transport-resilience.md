# 07 — Widget transport resilience: retry, poll-until-terminal fallback, watchdog

**Epic:** 1 Streaming | **Priority:** P0 | **Depends on:** 03, 04, 06 | **Status:** done (2026-07-02)

## Delivery notes

- **New recovery module** `subscription/recovery/widget-transport-recovery.ts`: `consumeTurnStreamWithRecovery` owns the whole consume-to-terminal loop for BOTH paths (`beginRun`'s POST stream and `driveSubscription`'s resume GET). `runSubscription` was reshaped into a single outcome-reporting attempt (`ended | aborted | replay-expired | error`) — it no longer dispatches `stream-failed` itself.
- **Classification** (`classifyTransportError`): `missing_terminal`/`network_error`/5xx/watchdog-abort/unknown-thrown → retryable; `stream_unavailable` (new client error code, mapped from the plan/04 409) → straight to poll; `malformed_stream`/4xx → fatal. Retry ladder 0.5/1/2/4 s from the store's cursor (`after = lastSeenSequence`); the reducer's sequence dedupe makes overlap replays idempotent.
- **Poll fallback**: `client.getTurnStatus` every 2 s until the server reports a terminal → dispatch the mapped terminal (`completed`→COMPLETED, `user_aborted`→CANCELLED, else FAILED with a public message) and clear the marker; the story-06 handoff effect then fetches history and clears the run. Only the SERVER's verdict fails the run — except 5 consecutive poll failures, the one local failure left.
- **Watchdog**: each attempt runs under its own AbortController (linked to the caller's slot signal — `beginRun` now gives `createRun` a per-connection controller too, so the watchdog can cut a wedged POST). No event for `inactivityTimeoutMs` (default 45 s; knob on `WidgetRunControllerInput`/`RunLifecycleContext`) → abort the connection → attempt reports `aborted` → outer-signal-untouched means "watchdog fired" → retry. The composer can never be locked forever.
- **Marker write-once**: written at identity, cleared only on server-confirmed terminal or replaced run — never on transport failure. The per-delta localStorage write and the marker's dead `lastSeenSequence` field are gone (cold resumes always replay from −1; live resumes read the store cursor — `SubscribeTarget.after` deleted too). Controller test proves ≤1 marker write per run.
- **Recovery stands down** when the run settles underneath it (cancel ack, clear, replaced run) or the caller aborts — never fabricating a local failure.
- **CRLF fix**: the SSE reader holds back a trailing `"\r"` until the next chunk instead of normalizing it into a false frame boundary; unit test splits `\r\n` across chunks.
- **Tests**: 8 recovery unit tests (drop→resume-no-duplicates, retries-exhaust→poll→server-terminal, `stream_unavailable`→poll, fatal→no-retry, wedged→watchdog→resume, abort-mid-recovery, settled-underneath, persistent-poll-failure); a new `widget-run-controller.recovery.test.tsx` with the throwing-stream fake the story demanded (the clean-end fake remains for the manual-reconnect path) + the marker write-count test. The `.test.tsx` 450-line budget quirk (gate only recognizes `.test.ts`) forced the file split — worth folding into `plan/35`/gate cleanup.
- **e2e**: back at the story-30 baseline (8 pass / 4 documented stale-UI). Two environment potholes en route, not code: Vite "Outdated Optimize Dep" 504s after a config change (fixed by `vite optimize` warm-up) and one Windows Node 0xC0000409 dev-server crash (not reproducible).
- **Docs**: widget-and-host-integration.md outbound steps 2–5 rewritten to the recovery contract; assistant-turn.md connection-bound consequences; ADR 0007 landed list — the epic-1 client contract is now fully landed there.

## Problem

The client gives up permanently on any transport blip — the "resumable" promise breaks exactly where it matters:

- A dropped connection throws `missing_terminal` (`packages/side-chat-widget/src/entities/conversation/api/sse/side-chat-sse-reader.ts:50-52`); `handleSubscriptionError` dispatches `stream-failed` → status FAILED (`widget-run-subscription.ts:131-141`); `isResumableRun` excludes FAILED (`widget-run-resume.ts:33-36`); `finalizeSubscription` clears the persisted marker because FAILED is terminal (`widget-subscription-lifecycle.ts:161-169`). Nothing retries; the reducer comment "reconnect can retry" (`widget-run-reducer.ts:158`) is false. Server generation continues; the Retry button submits a **new** turn → duplicate answers.
- The controller test "proving" resume passes only because its fake stream ends cleanly instead of throwing (`widget-run-controller.test.tsx:227-231`).
- A zombie half-open connection never errors and never yields: status stays STREAMING, composer locked forever, and the same-turn guard blocks every reconnect (`widget-subscription-lifecycle.ts:52-64`). `fetch` streaming does not auto-recover the way `EventSource` does.
- A CRLF pair split across chunks corrupts framing (`side-chat-sse-reader.ts:76-77` rewrites a lone trailing `\r` to `\n` → false frame boundary → `malformed_stream` → run fails).

## Decided approach (ADR-0007 (docs/adr/0007-connection-bound-streaming.md) client contract)

Transport failures are **reconnecting**, not terminal:

1. **Classify errors:** `missing_terminal`, network errors, `http_error` 5xx, and the story-04 `stream_unavailable/not_stream_owner` are _retryable_; protocol violations (`malformed_stream`, sequence regressions) and 4xx auth errors are _fatal_.
2. **Retry ladder:** on retryable failure → status RECONNECTING (composer stays locked, spinner honest) → bounded backoff (e.g. 0.5 s/1 s/2 s/4 s, max ~5 attempts) resubscribing via the resume GET with `after=lastSeenSequence` (same instance will succeed in the common case).
3. **Poll fallback:** when retries exhaust OR the server says `not_stream_owner` → poll `GET /chat/turns/:id` (plain DB read, works on any instance; use the api client's `resolveRun`/turn-status surface — wire it here, see story 03) every ~2 s until the turn is terminal → then run the story-06 handoff (refetch history, clear run). Only surface FAILED if the _server_ says the turn failed, or polling itself errors persistently.
4. **Inactivity watchdog:** no event for N seconds (config on the widget, default ~45 s — must exceed the story-17 server heartbeat interval) → abort the connection and enter the retry ladder from the current cursor.
5. **Marker:** never cleared on transport failure — only on server-confirmed terminal (after handoff) or replaced run. Write it once at run start, clear at terminal (also fixes the per-delta synchronous localStorage write — `widget-run-subscription.ts:58`, `widget-subscription-lifecycle.ts:144-150`; the per-event `lastSeenSequence` field is never read by resume, both cold resumes hardcode `after=-1`).
6. **CRLF:** hold back a trailing `\r` until the next chunk in the reader's normalizer.

## Tasks

1. Implement error classification in `widget-run-subscription.ts` / reader error types.
2. Add RECONNECTING status handling to the reducer + projection (spinner stays; composer locked; no error notice).
3. Retry ladder + watchdog in `widget-subscription-lifecycle.ts` (replace the same-turn no-op guard with "adopt if live, retry if wedged" — the watchdog abort makes the guard safe).
4. Poll-until-terminal fallback module; on terminal, delegate to story 06's handoff.
5. Marker write-once/clear-at-terminal; delete the dead `lastSeenSequence` marker field.
6. CRLF holdback in `side-chat-sse-reader.ts` + unit test with a `\r\n` split across chunks.
7. Fix the controller tests to use a fake stream that **throws** mid-stream (the current clean-end fake hides the whole bug class); add tests: drop→retry→resume-no-duplicates; drop→retries-exhausted→poll→terminal→history; zombie (no events)→watchdog→resume; cancel-during-reconnect.

## Acceptance criteria

- [ ] Kill the local service mid-turn and restart it: widget shows reconnecting, then (turn reaped, story 05) resolves via polling to a failed state from the SERVER, no local fake-FAILED, no marker loss.
- [ ] Simulated mid-stream throw: stream resumes from cursor with zero duplicate/missing deltas (assert reducer sequence set).
- [ ] Composer can never be locked forever: watchdog fires in a wedged-connection test.
- [ ] No localStorage write per delta (spy: ≤2 writes per run).

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run test:e2e
npm run verify
```
