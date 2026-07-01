# 33 — Composer correctness + honest context ring

**Epic:** 6 Widget UI | **Priority:** P1 | **Depends on:** — | **Status:** todo

## Problem

1. **IME composition:** Enter-to-send has no `isComposing` check (`packages/side-chat-widget/src/shared/ui/composer.tsx:202-214`) — CJK/IME users send mid-composition.
2. **Focus/disable:** the textarea is `disabled` while a turn is busy (`composer.tsx:114`), which drops focus on submit and never restores it; users also can't compose their next message during streaming.
3. **Placebo setting:** "Send with Ctrl+Enter" is local state in `SettingsPanel` (`shared/ui/settings.tsx:121`, rendered by `settings-groups.tsx:79-90`) wired to nothing and not persisted; `Composer.sendOnEnter` has no consumer.
4. **Fabricated context ring:** `estimateVisibleContextPercent` = `characters / 48` clamped 6–100 (`features/prompt/ui/widget-footer.tsx:135-139`) while real `usage` from `sidechat.completed` sits unused in run state (`widget-run-reducer.ts:106`). The ring is `aria-hidden` with no tooltip (`shared/ui/composer.tsx:57-82`) — it communicates nothing truthful to anyone.
5. **Overflow:** the user bubble lacks `break-words` — an unbroken URL overflows the 82% cap (`shared/ui/message.tsx:35-39`).

## Decided approach

1. Guard Enter on `event.nativeEvent.isComposing` (and `keyCode !== 229` for older engines); unit test with a synthetic composition event.
2. Keep the textarea **enabled** during streaming (users may draft; Send stays disabled/armed-off until idle); restore focus to the textarea after send and after terminal. If product prefers hard-blocking, at minimum restore focus on re-enable — decide in-story, default: enabled-drafting.
3. Ctrl+Enter setting: wire it for real — persist beside the theme preference (`features/theme`/settings storage pattern), thread to `Composer.sendOnEnter` (Enter inserts newline when the mode is Ctrl+Enter). If product doesn't want the option, delete the switch instead; default: wire it.
4. Context ring: drive from real usage — accumulate `usage` from completed events (already in run state) against the active model's context-window size (available via the model catalog — check `entities/*/model` catalog types for a contextWindow field; if absent, add it to the catalog metadata in `chat-protocol`/service model DTOs). Make it visible to AT: `role="meter"`, label, and a tooltip naming tokens used / window. If the catalog can't carry window sizes, remove the ring rather than keep the fiction (owner default: implement real usage).
5. `break-words` (or `overflow-wrap:anywhere`) on message bubbles; add a long-URL fixture to the showcase.

## Acceptance criteria

- [ ] IME composition Enter does not send (unit test).
- [ ] Focus returns to the composer after send and after turn completion (RTL test).
- [ ] Ctrl+Enter mode persists across reloads and changes Enter behavior (test), or the switch is gone.
- [ ] The ring reflects real token usage with an accessible label, or is removed (no `chars/48` anywhere).
- [ ] A 300-char unbroken string stays inside the bubble (showcase + e2e viewport check).

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run test:e2e
npm run verify
```
