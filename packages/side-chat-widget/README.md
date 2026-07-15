# side-chat-widget

Read this when: editing the embeddable React widget.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: backend workflow or protocol definitions.

## Owns

- Public React widget API.
- Browser-safe native AI SDK transport plus the protocol-backed client.
- FSD layers for chat, conversation, prompt, panel, and shared UI.
- Protocol event projection into widget message/activity state.
- Host bridge usage from browser UI.

## Does Not Own

- `sidechat.v1` protocol definitions.
- Agent runtime, provider, or tool execution.
- Service persistence or auth.
- Effect workflows.

## Public Surface

`src/index.ts` exports one discriminated widget API. New v7 consumers pass a
`workflowChat` configuration with `baseUrl` and an optional request-time
`getRequestConfig` callback. The branch starts in a client-only New chat draft
unless `initialConversationId` names a server-known conversation for that mount.
It validates history and keeps one widget-owned conversation session per persisted
conversation. That session may replace its immutable, abortable stream reader
while preserving one visible timeline and lifecycle. The reader folds
`readUIMessageStream` projections into the session reducer; it holds no visible
state. `WorkflowChatTransport` owns POST, replay, and cancel requests. Request
configuration is resolved for every request so a refreshed auth token is not
captured at mount time.

Workflow conversation selection is deliberately independent of routing and idle
browser persistence. `workflowActiveTurnStorageKey` opts one widget instance into
a tab-scoped `sessionStorage` cursor containing only the foreground active
conversation and run ids. The cursor is written at service acceptance, survives
reconnect and approval pauses, and is cleared when foreground selection leaves
that run or after the terminal snapshot handoff. On refresh the service's
coherent conversation state must confirm the cursor before reattachment. A stale
cursor is cleared without discarding the selected persisted conversation or its
terminal history.

The authenticated workflow conversation catalog is `{ conversations,
runningConversationIds }`. Running ids are display/activity state only: they are
filtered to validated catalog rows and do not choose a conversation. The
protocol and workflow transports share one `SideChatPanelView` for settings,
sidebar, header, switcher, refresh, and non-blocking navigation while retaining
their own feed/session content.

Workflow catalog, coherent conversation state, model, tool, and capability reads
use one exported TanStack Query prefix. Refresh invalidates that prefix without
remounting an active chat; an idle persisted conversation reconciles after
refetch, while a local draft remains New chat. A widget-lifetime session registry
owns each visible conversation aggregate independently of panel visibility and
selection, so closing, reopening, switching conversations, or persistence loading
cannot erase a stream. The session reducer is the only visible-state authority;
native stream readers are disposable input. Recovered sessions move through
reattaching and settling phases. A newer state observation retires the obsolete
reader, folds the durable snapshot, and opens one fresh reader only if the run is
still active.

`GET /api/activity` provides the subject-scoped snapshot-and-live lifecycle feed
used by already-open tabs. Its running/terminal transitions refresh the catalog
and the selected affected history without persisting or changing selection.

The native branch renders the validated AI SDK `UIMessage` part timeline with
source-ordered text, reasoning, tool lifecycle, source, file, approval, and
terminal presentations. Thinking stays visible for live and completed messages,
auto-expands only while reasoning is the active output, and collapses when answer
text begins. Its text uses the same Markdown wrapper as assistant answers. History metadata
is also the reload-safe terminal projection: completed messages retain finish
semantics, while failed, timed-out, and cancelled messages retain any
already-visible text/reasoning plus a public error or cancellation state. Raw
provider errors and content-filtered output are never admitted to this metadata.
An optional `hostBridge` keeps page context separate
from native client tools. **Include page context** appears only when authenticated
service capabilities enable it and `hostBridge.getContext` is registered; it
defaults off and collects one fresh snapshot only for an opted-in send or
regenerate. `hostBridge.getCapabilities` advertises native client tools,
dispatches dynamic `onToolCall` requests once, and posts their safe outcome to
the durable workflow hook. Approval cards post decisions
to the service; the server owns continuation and replay updates the same tool
row. Both transports accept the same `renderActivityItem` callback. Protocol-specific
turn profiles remain available only on the `client` branch.

The protocol-backed branch accepts `client` and exports
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

`renderActivityItem` is the shared custom-rendering seam for eligible activity in
either transport's message trace. It receives the exported, widget-owned
`SideChatActivityItem`: `id`, discriminating `kind`, `status`, `title`, optional
`body`, and normalized `tool` or `hostCommand` detail. It contains no protocol,
AI SDK, provider, source, image, or approval DTO. Return a `ReactNode` to replace
that item's default, or `undefined` to keep it.

Reasoning tries the callback before its default. Tool-detail policy remains the
disclosure boundary: `hidden` drops tools without calling it, `name` keeps the
compact default without calling it, and `full` tries it before existing detail.
Interactive approval cards always use the security-owned default and never call
the callback. The seam cannot change projection, execution, approval decisions,
or host-command dispatch; sources and images retain their message-level defaults.

`@side-chat/side-chat-widget/testing` exports widget model projection helpers
for harness tests. It is not a host application API.

## Main Flows

```txt
workflowChat -> coherent messages + active-turn snapshot -> widget session authority
  -> disposable WorkflowChatTransport/readUIMessageStream epoch
  -> native UI message projections -> session reducer
  -> POST /api/chat/:runId/cancel on stop

protocol client:
user submit -> optimistic widget state -> createRun (POST response stream)
  -> protocol events -> widget messages/activity
reconnect (visibility/online/remount) -> owner-bound subscribeTurn from last sequence
  -> status polling + terminal history when the live buffer is unavailable
  (features/chat/model/reconnect/)
subscribeActivity -> running conversation ids -> sidebar "generating" dot
  (features/chat/model/activity/use-activity-stream.ts)
```

## Boundary Rules

- Do not import Effect, Hono, DB, provider SDKs, or runtime internals.
- Keep AI SDK imports inside the isolated `workflow-chat` slices; provider SDKs
  remain server-only.
- Keep stream mechanics in feature/model code, not prompt/footer rendering.
- Treat `src/shared/ai/**` as copied visual primitives, not project style.

## Tests

Widget unit/model tests and harness E2E tests.

## Canonical Docs

- `docs/architecture/widget-and-host-integration.md`
- `docs/architecture/runtime-and-protocol-events.md`
- `packages/side-chat-widget/src/shared/ai/README.md`
