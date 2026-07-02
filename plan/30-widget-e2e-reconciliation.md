# 30 — Widget e2e reconciliation + CI wiring

**Epic:** 6 Widget UI | **Priority:** P0 (a red-if-ever-run suite certifies behavior that isn't there) | **Depends on:** 13, 19, 23; after epic-1 client stories | **Status:** in-progress (reconciliation done 2026-07-02; CI + fidelity + new scenarios remain)

## Delivery notes (reconciliation half, 2026-07-02)

**The suite is GREEN: 12/12 in ~27 s** (down from 8/4 with four tests burning full timeouts). Every stale assertion was resolved per this story's rule — rewrite to the shipped UI, with a comment pointing at the story that rebuilds the feature:

- `:91` + `:189` (tool details): rewritten to the shipped §9.9 contract — a tool renders as a humanized plain-text row ("Mock web search"), non-interactive, no expanded query/result details. The `:189` test now also pins the _absence_ of a details surface, so plan/23's rebuild consciously flips it.
- `:246` (dismiss error): rewritten to the shipped ErrorNotice — a `role=alert` with a "Try again" secondary action, no dismiss control. The test now also proves retry is _functional_: clicking it resubmits, the error scenario fails again, and the widget lands back in the honest error state with the composer usable.
- `:288` (chat-size hover + model popover): the context ring is `aria-hidden` decoration (plan/33 owns its fate) and mock mode has no model catalog, so the test moved to local-service mode and asserts the real thing it was for — the model selector opens as an anchored popover contained in a short viewport ("Search models..." visible + in-viewport). Two shipped-UI facts discovered en route: the trigger is a `combobox` showing the model id, and the Base UI popup carries `role=dialog` (the old "no dialog" assertion asserted an implementation detail).
- Earlier under stories 03/06: transport waits moved to POST `/chat/runs`, identity-first mock stream verified, the run→history handoff test rewritten, demo-panel z-index and Vite optimizeDeps fixed.

**Still this story's scope (with deps 13/19/23):** flip the CI e2e job to required (13), mock-stream fidelity (multi-delta pacing, a `blocked` scenario), iframe-bridge hardening (`getCapabilities` forwarding, `result.data` passthrough, `message.source` check), and the two new scenarios (reload-mid-turn → resume; cancel-in-other-tab). One flake to watch: occasional Windows dev-server crashes/socket exhaustion under repeated local runs — CI wiring should retry-on-crash or serialize.

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
