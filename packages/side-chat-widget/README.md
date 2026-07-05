# side-chat-widget

Read this when: editing the embeddable React widget.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: backend workflow or protocol definitions.

## Owns

- Public React widget API.
- Browser-safe API client and SSE reader used by widget consumers.
- FSD layers for chat, conversation, prompt, panel, and shared UI.
- Protocol event projection into widget message/activity state.
- Host bridge usage from browser UI.

## Does Not Own

- `sidechat.v1` protocol definitions.
- Agent runtime, provider, or tool execution.
- Service persistence or auth.
- Effect workflows.

## Public Surface

`src/index.ts` exports the side-chat widget API, including
`createSideChatApiClient` for service-backed consumers. `SideChatApiClient` drives
the resumable run/turn flow through `createRun`, `subscribeTurn`, `resolveRun`,
`getTurnStatus`, `cancelTurn`, and `subscribeActivity`, plus optional conversation
list/history reads.

The widget can render a conversation selector when the supplied
`SideChatApiClient` supports conversation listing and history reads.
`conversationStorageKey` enables browser-local restoration of the last selected
conversation shell. The conversation list and history hydrate through TanStack
Query (`entities/conversation/api/query/`), not the live turn stream.

`defaultTheme` picks the initial named theme (`graphite` | `sapphire` | `sage` |
`ocean`) and `themeStorageKey` enables browser-local persistence of the chosen
theme. Themes
are scoped to the widget root and never leak onto the host page; see
`docs/architecture/widget-and-host-integration.md` (Theming And Layout).

**Light-only by design.** The widget ships no dark mode — the four named themes
are the variation axis, not a light/dark toggle. The widget root does not respond
to the host page's `.dark`/`prefers-color-scheme`; a future dark palette would be
added as a fifth theme, not a mode.

### Adding a theme

The theme id/name/description list is single-sourced in
`src/shared/lib/widget-themes.ts`; `entities/theme` re-exports it and the settings
picker reads it, so a new theme is three edits, not five:

1. Add `{ id, name, description }` to `WIDGET_THEMES` (and the id to
   `WIDGET_THEME_IDS`) in `src/shared/lib/widget-themes.ts`.
2. Add a `[data-sidechat-theme="<id>"]` token block in `styles.css` that overrides
   the palette (copy an existing named theme; the default `graphite` is the `:root`
   base and has no such block).
3. Add a `[data-sidechat-theme-preview="<id>"]` block in `styles.css` so the
   settings swatch renders the real palette instead of falling back to graphite.

`widget-themes.test.ts` fails if a new id is missing either CSS block, so a missed
step is caught by `npm run verify`. Appearance token values (corners, density, text
scale, typeface, elevation) are single-sourced in `shared/lib/widget-appearance-style.ts`.

The built-in settings view also persists appearance controls under
`side-chat-widget:appearance`: accent, corners, density, text size, typeface, and
elevation. These controls re-skin the widget root by writing shared token
overrides, not component-local styles.

`open` and `onOpenChange` let a host app own iframe open/closed state. Pair them
with `renderClosedLauncher={false}` when the host renders its own launcher
button outside the Side Chat frame.

`renderActivityItem` is the custom-rendering seam for one activity item in the
message trace (tool call, host command, reasoning row). It receives a
`WidgetActivityItem` (exported type: id, kind, status, title, and the protocol
`details` with tool input/result, host-command payload/result, sources, and
images) and returns a `ReactNode` to replace only that item's default rendering,
or `undefined` to keep the default. It is a rendering seam only — protocol
projection and host-command dispatch are unaffected. Defaults without it: tools
and host commands with disclosable payloads render as expandable detail rows,
attributed sources render as a foldable "N sources" list under the answer, and
produced images render as constrained inline thumbnails.

`@side-chat/side-chat-widget/testing` exports widget model projection helpers
for harness tests. It is not a host application API.

## Main Flows

```txt
user submit -> optimistic widget state -> createRun -> subscribeTurn (resumable)
  -> protocol events -> widget messages/activity
reconnect (visibility/online/reload) -> subscribeTurn from last sequence
  (features/chat/model/reconnect/)
subscribeActivity -> running conversation ids -> sidebar "generating" dot
  (features/chat/model/activity/use-activity-stream.ts)
```

## Boundary Rules

- Do not import Effect, Hono, DB, provider SDKs, or runtime internals.
- Keep stream mechanics in feature/model code, not prompt/footer rendering.
- Treat `src/shared/ai/**` as copied visual primitives, not project style.

## Tests

Widget unit/model tests and harness E2E tests.

## Canonical Docs

- `docs/architecture/widget-and-host-integration.md`
- `docs/architecture/runtime-and-protocol-events.md`
- `packages/side-chat-widget/src/shared/ai/README.md`
