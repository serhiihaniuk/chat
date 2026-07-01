# 34 — Rebranding/labels surface + mobile bottom sheet

**Epic:** 6 Widget UI | **Priority:** P2 | **Depends on:** — | **Status:** todo

## Problem

1. **Rebranding/localization is blocked by hardcoded copy.** `SideChatWidgetLabels` covers exactly three strings (`side-chat-widget.types.ts:10-14`) while user-visible copy is constants: the empty-state title/description — including "I can see the page you're viewing", shown even when NO host bridge exists (`widgets/side-chat/ui/side-chat-widget.tsx:46-48`) — plus "New chat", "Thinking...", "Thought for Ns", relative-time strings (`entities/conversation/model/conversation-options.ts:26-40`), settings copy, error/cancel/blocked notices (stories 19/23 add more). The agent mark is a single component (`shared/ui/agent-mark.tsx`) but not injectable.
2. **Mobile bottom sheet is unbuilt.** The locked design record says floating launcher → floating panel, **bottom sheet on mobile**; the panel is a `fixed right-4 bottom-4` card at every viewport with only max-clamps (`features/panel/ui/resizable-panel.tsx:119-123`, `resizable-panel-resize.ts:129-140`); the only mobile behavior is hiding resize handles.

## Decided approach

1. **Labels:** expand `SideChatWidgetLabels` into a flat, fully-optional strings object covering every user-visible string (empty state, composer placeholder/actions, thinking/thought-for, relative times as format functions where needed, settings, notices), deep-merged over defaults; a single `defaultWidgetLabels` module becomes the one place copy lives. Fix the empty-state honesty bug: the "I can see the page" line renders only when a host bridge with context capability is present. Agent mark: add `renderAgentMark?: () => ReactNode` (or accept a ReactNode prop) falling back to the default.
2. **Bottom sheet:** below the mobile breakpoint (align with the existing `max-sm` usage), the panel becomes a bottom sheet: full-width, anchored bottom, height ~85dvh, slide-up animation, drag-handle affordance optional (no gesture library — a close affordance is enough for v1), body scroll behind is contained (the iframe embedding note in `docs/operations/embed-widget-iframe.md` may need a sizing paragraph — the HOST controls the iframe element's geometry; document the recommended mobile iframe CSS). Launcher unchanged. Showcase section + e2e viewport test (Playwright mobile viewport).

## Acceptance criteria

- [ ] Every user-visible string is overridable via `labels` (test: render with a full override, assert no default English remains in the DOM for covered surfaces).
- [ ] The page-context claim appears only when the bridge provides context (test with and without a bridge).
- [ ] At 375×812 the panel renders as a bottom sheet; at desktop it's the floating panel (e2e viewport assertions + screenshots).
- [ ] Embed doc updated with mobile iframe guidance if geometry recommendations changed.

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run test:e2e
npm run verify
```
