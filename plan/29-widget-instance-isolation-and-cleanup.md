# 29 — Widget instance isolation + lifecycle cleanup

**Epic:** 5 Robustness | **Priority:** P1 | **Depends on:** 03 | **Status:** todo

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

- [ ] Two widgets with different `conversationStorageKey`s on one page run independent turns simultaneously (harness page test).
- [ ] StrictMode double-mount opens exactly one SSE connection per run (spy on the client).
- [ ] Removing the widget from the DOM closes its connections (leak test).
- [ ] Activity reconnects back off exponentially; tab focus no longer kills a healthy stream (unit tests with fake timers).
- [ ] Dead props gone from the public types.

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run test:e2e
npm run verify
```
