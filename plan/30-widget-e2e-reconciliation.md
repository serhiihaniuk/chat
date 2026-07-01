# 30 — Widget e2e reconciliation + CI wiring

**Epic:** 6 Widget UI | **Priority:** P0 (a red-if-ever-run suite certifies behavior that isn't there) | **Depends on:** 13, 19, 23; after epic-1 client stories | **Status:** todo

## Problem

The Playwright suite asserts a UI that no longer exists, and nothing runs it (no CI until story 13). In `test-harness/widget-harness/e2e/widget-harness.spec.ts`:

- `:66` expects `harness_local_only` result-code text — result codes render nowhere.
- `:189-218` expects a clickable `mock_web_search` expanding to "Search query"/"Result"/"Search results" + source domain — the detail component was deleted; the unit test asserts the opposite (`widget-message-view.test.tsx:52-53`). Story 23 rebuilds this properly.
- `:253` clicks a "Dismiss error" button — `ErrorNotice` has only "Try again".
- `:294-306` expects a "Chat size estimate" hover — the ring is now `aria-hidden` (story 33 decides its fate).
- `:220-229` expects `harness_command_failed` text.

Also, mock-stream fidelity gaps hide whole behavior classes from e2e: one delta carries the entire response (`mock-stream-client.ts:145-152` — incremental streaming and stick-to-bottom never exercised), no `sidechat.blocked` scenario exists (`config/modes.ts:8-13`), and the iframe-mode postMessage bridge omits `getCapabilities` (`post-message-host-bridge.ts:46-48`) so embedded turns can never declare host commands — an undocumented asymmetry. The iframe bridge also silently drops `result.data` (`:41-44,104-106`) unlike the in-process bridge, and doesn't check `message.source === window.parent` (one-line hardening).

## Decided approach

1. Rewrite every stale assertion against the UI that ships **after stories 19/23** (tool cards expandable, cancelled/blocked states, no dismiss-vs-retry mismatch). Each stale assertion is a decision — restore the feature or rewrite the test; stories 19/23 restore most of them, so this story mostly rewrites selectors/copy.
2. Mock-stream fidelity: split responses into multiple deltas with realistic pacing (exercises stick-to-bottom + incremental markdown); add a `blocked` scenario mode; emit the story-02 identity frame (done in 03 — verify).
3. Iframe bridge: forward `getCapabilities` across postMessage; pass `result.data` through; add the `message.source` check. Update `docs/architecture/host-commands.md` iframe section if shapes change.
4. Flip the story-13 e2e CI job from allowed-failure to required.
5. Add the two e2e scenarios the epic-1 work made testable: reload-mid-turn → resume/poll → final answer; cancel-in-other-tab → calm cancelled state.

## Acceptance criteria

- [ ] `npm run test:e2e` green locally and in CI (required job).
- [ ] Suite covers: streaming (multi-delta), tool card expand, sources render, blocked, cancelled, host-command round-trip in BOTH standalone and iframe modes, resize persistence (existing), reload-resume.
- [ ] No assertion references deleted UI (grep the spec for the five stale strings).

## Verification

```sh
npm run test:e2e
npm run test:e2e:persistent
npm run verify
```
