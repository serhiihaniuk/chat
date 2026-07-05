# 29 — Widget instance isolation + lifecycle cleanup

**Epic:** 5 Robustness | **Priority:** P1 | **Depends on:** 03 | **Status:** done

## Problem

1. **Two-instance isolation is half-wired.** `widget-run-store.ts:70-78` keys stores by `{storageKey, baseUrl}` and its JSDoc promises isolation — but the only caller always passes `baseUrl: undefined` (`use-widget-chat.ts:65`). Two widgets on one page without distinct `conversationStorageKey`s share `"anonymous::default"`: starting a run in widget B silently replaces widget A's live run. Each instance has its own QueryClient (`side-chat-widget.tsx:60`), so run state and list/history diverge confusingly.
2. **Unmount never aborts the live subscription; remounts duplicate streams.** `useWidgetRunController` has no unmount cleanup for `subscriptionRef` (`widget-run-controller.ts:73`, only `clearRun` aborts at `:126-130`). A remount gets a fresh empty ref and its mount-reconnect opens a **second** concurrent SSE to the same turn while the orphan keeps feeding the store (StrictMode hits this every dev session); removing the widget for good leaks the connection.
3. **Activity stream hygiene:** fixed 1 s reconnect with no backoff (hammers a down server — `use-activity-stream.ts:7,109`); every tab-focus aborts a _healthy_ connection and refetches the list (`:55-57`); the `subscribe` function is captured once at mount so a swapped `client` prop (token rotation) keeps streaming with the old client (`:46`) — inconsistent with the run path's `contextRef` pattern.
4. Minor: `readWidgetConversationStore` (localStorage JSON.parse) runs on every render as a `useRef` initializer argument (`use-widget-chat.ts:40`).
5. Dead public API touching this area: `initialState` and `panelActions.onMinimize` props accepted but never read (`side-chat-widget.types.ts:16-19,27,52`); `SideChatWidgetStateSnapshot = Record<string, never>`; `themeRootProps` computed and unused (`use-widget-theme.ts:43`).

## Decided approach

1. Wire the api client's `baseUrl` into the run-store key (and any instance-scoped module state); document in `SideChatWidgetProps`: two widgets against one service require distinct `conversationStorageKey`s (and that this also namespaces localStorage).
2. Move the active-subscription slot next to the run store (module scope, same key) so a remount **adopts** the live subscription instead of duplicating; add real unmount cleanup that releases-without-aborting when the store still owns a live run (continuity) but aborts when the widget instance is the last owner (refcount). StrictMode double-mount test required.
3. Activity stream: exponential backoff with jitter and a cap; don't abort a healthy connection on focus (only refetch the list, or rely on `staleTime`); read the client through a ref like the run path. Add `staleTime` (~30 s) to the conversation list query (currently default 0 + refetchOnWindowFocus stacks a double fetch per focus — `conversation-query-repository.ts`).
4. Lazy `useState(() => readWidgetConversationStore(...))` for the storage read.
5. Delete the dead props/exports (`initialState`, `onMinimize`, `StateSnapshot`, `themeRootProps`); `resolveRun` was resolved in stories 03/07 (keep whichever decision landed).

## Acceptance criteria

- [x] Two widgets with different `conversationStorageKey`s run independent turns simultaneously (`widget-run-controller.lifecycle.test.tsx`).
- [x] A StrictMode remount adopts the live stream — one create, zero re-subscribes (lifecycle test spies on the client).
- [x] Removing the widget from the DOM aborts its live subscription (leak test asserts the connection's signal aborts after the deferred last-owner teardown).
- [x] Activity reconnects back off exponentially (fake-timer test: 500 → 1000 → 2000 ms); tab focus refetches the list without aborting a healthy stream.
- [x] Dead props/exports gone from the public types.

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run verify
```

## Delivery notes

**1. Instance isolation.** The run store + live-subscription slot are keyed by
`{ storageKey, baseUrl }`; `use-widget-chat` now passes the real `client.baseUrl`
(newly exposed as a read-only field on `SideChatApiClient`) instead of `undefined`,
so two widgets pointed at different services never share a run. `SideChatWidgetProps.
conversationStorageKey` documents that two widgets against one service MUST use
distinct keys (the key namespaces both localStorage and the module store). The
mount storage read is a lazy `useState(() => read())` so `JSON.parse` runs once,
not every render.

**2. Refcounted subscription slot (the core fix).** The active-subscription slot
moved from a per-mount `useRef` to module scope, shared across mounts under the
same key — so a remount adopts the in-flight stream via `openSubscription`'s
same-turn guard instead of opening a second one. A refcount tracks mounted
controllers; the last unmount schedules a **deferred** (`setTimeout(0)`) abort, so
a StrictMode/fast remount re-acquires and cancels it (adoption), while a widget
truly removed from the DOM lets it fire and closes the SSE (no leak).

**3. Activity stream hygiene.** Fixed 1 s reconnect → full-jittered exponential
backoff (500 ms → 30 s cap), reset on a successful connect so a reachable server
retries fast and a down one escalates. Tab focus no longer aborts a healthy
stream — it only refetches the list (the browser flushes buffered events on
resume). The subscribe function is read through the input ref each attempt, so a
rotated `client` (token refresh) takes effect on the next reconnect. Added an
explicit `staleTime: 30_000` to the conversation-list query (the QueryClient
already had `refetchOnWindowFocus: false` + a 15 s default, so the plan's
"double-fetch per focus" was already largely mitigated).

**4. Dead code removed.** Deleted `initialState`, `SideChatWidgetStateSnapshot`,
`panelActions.onMinimize`, and `WidgetThemeRootProps`/`themeRootProps`, plus their
barrel re-exports — all confirmed unread.

`npm run verify` green; the widget suite grew from 155 to 160 tests (StrictMode
adoption, DOM-removal leak, two-widget isolation, activity backoff, focus-no-abort).
