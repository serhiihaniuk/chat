# 33 — Composer correctness + honest context ring

**Epic:** 6 Widget UI | **Priority:** P1 | **Depends on:** — | **Status:** done

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

- [x] IME composition Enter does not send (unit test).
- [x] Focus returns to the composer after send and after turn completion (RTL test).
- [x] Ctrl+Enter mode persists across reloads and changes Enter behavior (test), or the switch is gone.
- [x] The ring reflects real token usage with an accessible label, or is removed (no `chars/48` anywhere).
- [x] A 300-char unbroken string stays inside the bubble (showcase + e2e viewport check).

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run test:e2e
npm run verify
```

## Delivery notes

**Decisions taken (all the in-story owner defaults).** Kept the field **enabled while
streaming** (draft-ahead), wired the Ctrl+Enter switch **for real** (not deleted), and
**implemented the real usage ring** (the model catalog already carries
`contextWindowTokens`, and the normalizer already passes it through to the widget).

**1. IME composition + Enter policy.** The Enter behaviour is one exported pure
function, `submitOnEnter` in `shared/ui/composer.tsx`, guarded on
`event.nativeEvent.isComposing || event.keyCode === 229`, then on busy, then on the
mode. It reads a narrow `ComposerEnterEvent` shape (a React `KeyboardEvent` satisfies
it structurally) so it is unit-tested directly — necessary because React's delegated
`onKeyDown` cannot be driven from a synthetic `dispatchEvent` under the node +
happy-dom harness (the event bubbles past React's root listener; verified `input` and
click still deliver). Shift+Enter is a newline in Enter-sends mode; Ctrl/Cmd+Enter is
the send in Ctrl+Enter mode.

**2. Enabled during streaming + focus.** `Field.Control` is no longer `disabled` while
busy — only the caller's own `disabled` prop disables it (the footer no longer passes
one). A bare Enter while streaming inserts a newline (it neither sends nor stops —
Stop stays the button's job). Focus returns to the field after a pointer send
(`send()` refocuses the ref) and on the busy→idle falling edge (`useRefocusOnIdle`).

**3. Ctrl+Enter persistence.** New `features/settings/model/use-send-preference.ts`
owns the boolean and its localStorage, following the **appearance-controls pattern** (a
fixed default key `side-chat-widget:send-preference`, always persisted) rather than the
theme opt-in-key pattern — this is a one-time editor-ergonomics choice, so it survives
reloads with no new public prop. The shell threads `sendWithCtrlEnter` into the
settings panel (now a controlled `SettingsPanel` prop, no longer dead local state) and
`sendOnEnter={!sendWithCtrlEnter}` into the footer → composer.

**4. Honest context meter.** Deleted `estimateVisibleContextPercent` (`chars/48`). New
`shared/ui/context-meter.tsx` divides real tokens (`contextTokensFromUsage(chat.usage)`
— the last completed turn's `totalTokens`, or input+output) by the selected model's
`contextWindowTokens` and renders a `role="meter"` with `aria-label`, `aria-valuenow`,
`aria-valuetext`, and a Base UI tooltip naming "used / window tokens". It renders
**nothing** until both numbers are known (turn-profile fallbacks with no catalog, or
before the first completion) — honest-or-gone, never a fabricated fill. It carries its
own `Tooltip.Provider` since the composer has no provider ancestor.

**5. Overflow.** `break-words` on the user bubble so an unbroken URL breaks inside the
82% cap. Guarded by a message-showcase fixture and an e2e test asserting the bubble's
`scrollWidth - clientWidth <= 1` for a 300-char unbroken string.

**Tests.** `composer.test.tsx` (Enter policy + field wiring/focus), `context-meter.test.tsx`
(meter value/label, hidden-until-known, clamp), `use-send-preference.test.tsx`
(default + persist + restore); widget suite 173 pass (+12). `npm run verify` green;
docs app builds (composer + message demos updated to the real props/fixture).
