# 34 — Rebranding/labels surface + mobile bottom sheet

**Epic:** 6 Widget UI | **Priority:** P2 | **Depends on:** — | **Status:** done

## Problem

1. **Rebranding/localization is blocked by hardcoded copy.** `SideChatWidgetLabels` covers exactly three strings (`side-chat-widget.types.ts:10-14`) while user-visible copy is constants: the empty-state title/description — including "I can see the page you're viewing", shown even when NO host bridge exists (`widgets/side-chat/ui/side-chat-widget.tsx:46-48`) — plus "New chat", "Thinking...", "Thought for Ns", relative-time strings (`entities/conversation/model/conversation-options.ts:26-40`), settings copy, error/cancel/blocked notices (stories 19/23 add more). The agent mark is a single component (`shared/ui/agent-mark.tsx`) but not injectable.
2. **Mobile bottom sheet is unbuilt.** The locked design record says floating launcher → floating panel, **bottom sheet on mobile**; the panel is a `fixed right-4 bottom-4` card at every viewport with only max-clamps (`features/panel/ui/resizable-panel.tsx:119-123`, `resizable-panel-resize.ts:129-140`); the only mobile behavior is hiding resize handles.

## Decided approach

1. **Labels:** expand `SideChatWidgetLabels` into a flat, fully-optional strings object covering every user-visible string (empty state, composer placeholder/actions, thinking/thought-for, relative times as format functions where needed, settings, notices), deep-merged over defaults; a single `defaultWidgetLabels` module becomes the one place copy lives. Fix the empty-state honesty bug: the "I can see the page" line renders only when a host bridge with context capability is present. Agent mark: add `renderAgentMark?: () => ReactNode` (or accept a ReactNode prop) falling back to the default.
2. **Bottom sheet:** below the mobile breakpoint (align with the existing `max-sm` usage), the panel becomes a bottom sheet: full-width, anchored bottom, height ~85dvh, slide-up animation, drag-handle affordance optional (no gesture library — a close affordance is enough for v1), body scroll behind is contained (the iframe embedding note in `docs/operations/embed-widget-iframe.md` may need a sizing paragraph — the HOST controls the iframe element's geometry; document the recommended mobile iframe CSS). Launcher unchanged. Showcase section + e2e viewport test (Playwright mobile viewport).

## Acceptance criteria

- [x] Every user-visible string is overridable via `labels` (test: render with a full override, assert no default English remains in the DOM for covered surfaces).
- [x] The page-context claim appears only when the bridge provides context (test with and without a bridge).
- [x] At 375×812 the panel renders as a bottom sheet; at desktop it's the floating panel (e2e viewport assertions + screenshots).
- [x] Embed doc updated with mobile iframe guidance if geometry recommendations changed.

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run test:e2e
npm run verify
```

## Delivery notes

**Labels: a flat, context-threaded override surface.** `shared/lib/widget-labels.ts`
is the one place built-in copy lives (`defaultWidgetLabels`) plus a flat `WidgetLabels`
type (strings, and format functions for counts/durations), a `resolveWidgetLabels`
merge (an `undefined` override keeps the default), and a `WidgetLabelsProvider` /
`useWidgetLabels` context defaulting to the built-ins (so standalone `shared/ui`,
showcase, and unit renders read real copy unwired). The shell resolves the caller's
`labels` once and provides it; every covered leaf reads `useWidgetLabels()` — no
prop-drilling. The public `SideChatWidgetLabels` (`Partial<WidgetLabels>`) is the
override surface; `placeholder`/`send`/`title` (the only three that were overridable)
fold into it unchanged.

**Covered surfaces (wired + tested):** empty state (title + both descriptions),
composer input aria, error notice (+ "Try again"), activity (thinking / thought-for-Ns
/ thought process / preparing / N sources), conversation (new chat, select chat,
generating, the five relative-time strings as functions, the five date-group labels),
and header/settings chrome (refresh, settings, new chat, close, back, settings title,
conversations, feed). The relative-time and group helpers in `conversation-options.ts`
now take `labels`, so localization reaches the switcher and the sidebar.

**Scoped OUT (documented, not a gap):** design-identity copy — theme names, accent
names, and appearance option labels ("Sharp"/"Cozy"/typeface names/elevation names) —
stays in the single-sourced design vocabulary (`widget-themes.ts`, story 32), and the
model-selector / message-actions primitives keep their built-in copy. Making the
labels type advertise only what is actually wired keeps the override contract honest;
these are a clean follow-up if a full localization needs them.

**Empty-state honesty fix.** `WidgetHostBridge` always carries `getContext`, so the
"I can see the page you're viewing" line now renders only when `hostBridge` is present;
without a bridge the neutral `emptyStateWithoutContext` shows. Covered by a with/without
bridge test.

**Injectable agent mark.** New `renderAgentMark?: () => ReactNode` prop falls back to
the built-in `AgentMark`, threaded to the two live sites (empty-state greeting +
header title).

**Mobile bottom sheet.** `useIsMobile` (matchMedia `(max-width: 639px)`, SSR-safe lazy
init) drives `ResizablePanel`: below the breakpoint it renders a full-width, bottom-
flush sheet at ~85dvh that slides up (`sc-widget-sheet` keyframe, reduced-motion
respected) and drops the resize handles; above it, the draggable floating card is
unchanged. The embed doc gains a mobile `@media (max-width: 640px)` iframe recipe — the
host owns the iframe geometry, so it must give the frame full width for the sheet to
fit.

**Harness note.** The widget DOM tests share `widget-test-env`; the bottom-sheet unit
test stubs `window.matchMedia` around an SSR render (scoped + restored) to assert the
sheet class + absent handles, and the e2e resizes 1280→375 to assert floating-card vs.
full-width-bottom geometry. Two `check-code-shape` exceptions were added (`shared/lib`
and `widgets/side-chat/ui`, both already at the 5-file cap) with reasons.

`npm run verify` green; widget suite 177 tests (+4).
