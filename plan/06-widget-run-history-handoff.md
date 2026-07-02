# 06 — Widget run→history handoff on terminal

**Epic:** 1 Streaming | **Priority:** P0 | **Depends on:** — | **Status:** done (2026-07-02)

## Delivery notes

- **Stream-owned guard keyed on non-terminal:** `shouldLoadHistory` now uses a `runOwnsHistory(run, conversationId, ownedRef)` predicate — a run owns its conversation's transcript only while NON-terminal, so history loading (and the header Refresh button) resumes the moment a run ends. The activity `onEvent` gate got the same keying, which fixes the other-tab case with no extra code, as predicted.
- **Fetch-then-clear handoff:** new `useHistoryHandoffAfterTerminal` in `use-widget-run-effects.ts`. On any terminal status it awaits `refreshHistory` (now an awaited `RefreshHistory` returning the fresh `ReadHistoryResult | undefined` via `invalidateQueries` + query state) and clears the run (`controller.clearRun`) only when fresh data actually landed AND the store still holds the same `requestId`. A failed run's `errorMessage` is copied into shell state before the clear so the notice survives; a run with no `conversationId` (pre-identity failure) stays visible.
- **Settle race handled:** the terminal stream event can beat the durable status commit, so a refetch may briefly report `activeTurn: running` without the final message. The handoff retries up to 3× (250ms) and gives up by KEEPING the run — the answer can never disappear onto a stale transcript. (Discovered from the server call order: `appendTurnEvent(completed)` precedes `completeAssistantTurn`.)
- **No dedupe needed:** `visibleMessages` is either the run's messages or history's — never both — and the clear lands in the same render as fresh history, so there is no duplicate/empty frame.
- **Tests:** 6 new handoff unit tests (fetch-then-clear, error carry-over, no-fresh-data keeps run, no-conversation keeps run, newer-run never clobbered, still-running never clears). The old "does not refetch history after a stream" regression test asserted the pre-handoff contract — rewritten to assert the new one (refetch happens; the answer stays visible while history takes over). e2e back at the story-30 baseline (8 pass / 4 documented stale-UI failures); the real-backend streaming tests now exercise the handoff for real.
- **Note for `plan/07`:** `RunLifecycleContext.refreshHistory` widened to `void | Promise<unknown>`; the repository's awaited `RefreshHistory` type is exported from `#entities/conversation` and is the poll-fallback's natural read primitive.

## Problem

A finished live run never hands off to server history — the "refresh/other tabs read the final message from the DB" half of the claude.ai model is unbuilt on the client:

- `runVisible` has no status check and nothing ever clears a COMPLETED/FAILED run from the store (`packages/side-chat-widget/src/features/chat/model/use-widget-chat.ts:71,88-94,186-189`) — the terminal run shadows refetched history until a full page reload.
- The header Refresh button invalidates a query that is _disabled_ while the run owns the conversation (`use-widget-chat.ts:73-76,166-170`; invalidating a disabled query is a no-op — `conversation-query-repository.ts:206-214`) — it is dead for the current conversation.
- A turn started in another tab for the same conversation never displays: the activity `onEvent` gate returns early because the stale terminal run still "owns" the conversation (`use-widget-chat.ts:136-140`).

## Decided approach

On terminal run status: refetch that conversation's history, and clear the run from the store once fresh data lands (fetch-then-clear, so there is no flicker frame where neither run nor history shows the answer). Key the "stream-owned" guard on **non-terminal** status so history loading resumes the moment a run ends.

Design points:

- Terminal ⟹ the assistant message is already committed server-side (finalization persists the message before the terminal status write — verified in `finalize-turn-generation.ts`), so fetch-after-terminal is race-free. Exception: aborted/failed turns may have NO persisted assistant message — after refetch, cleared run + history without the partial answer is the correct claude.ai-style outcome; make the reducer's terminal state carry any error/blocked notice until the clear so the user sees why (coordinate with story 19's status mapping).
- Multi-tab: with the stream-owned guard keyed on non-terminal status, the activity-event path (`use-widget-chat.ts:136-140`) starts refetching for conversations whose local run is terminal — that fixes the other-tab case with no extra code.
- This also revives the Refresh button (query no longer disabled once the run is terminal). Keep the button.

## Tasks

1. Read `use-widget-chat.ts` fully (memo at :88-94, guards at :73-76 and :136-140), `widget-run-store.ts` (`clear`), `conversation-query-repository.ts` (invalidate/refetch semantics).
2. Change `shouldLoadHistory` / stream-owned guard to non-terminal-only.
3. Add the terminal effect: on run status becoming terminal → `refreshHistory(conversationId)` → on success, `store.clear()` (only if the store still holds that same `requestId` — don't clear a newer run).
4. Ensure `visibleMessages` prefers history once the run is cleared and never renders both (no duplicate assistant message during the one-frame overlap — dedupe by `assistantTurnId` if needed).
5. Tests: completed run → history refetch called → store cleared → messages come from history; failed run keeps the error notice until clear; other-tab turn (activity event, no local run or terminal local run) triggers refetch; Refresh button refetches for the active conversation.

## Acceptance criteria

- [ ] After a turn completes, the message list is served by TanStack history (assert store empty) with no visible flicker/duplication in harness e2e.
- [ ] Refresh button refetches the current conversation (no longer a no-op).
- [ ] A turn started in tab B appears in tab A after terminal via the activity path.

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget -- use-widget-chat
npm run test:e2e
npm run verify
```
