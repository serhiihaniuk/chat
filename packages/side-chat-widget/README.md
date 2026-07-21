# side-chat-widget

Read this when: editing the embeddable React widget.
Source of truth for: the widget public surface, browser-side boundaries, and appearance extension points.
Not source of truth for: service workflow or persistence details.

## Public surface

`SideChatWidget` has one native Workflow-backed API. Consumers pass
`workflowChat` with a service `baseUrl`, a required opaque non-secret `scopeKey`,
and an optional request-time auth resolver. `scopeKey` identifies the current
authenticated workspace/subject for browser caches and live sessions; hosts must
change it when that scope changes and must never put credentials in it.
An optional `hostBridge` supplies page context and native client tools.

The widget owns:

- conversation selection, catalog queries, and coherent state reads;
- one session aggregate per persisted conversation;
- live AI SDK UI message stream projection and replay attachment;
- stop, reconnect, approval, and client-tool interactions;
- running-conversation activity from `GET /api/activity`;
- panel, theme, appearance, settings, and host-controlled open state.

The service snapshot is authoritative after reload. A tab may persist only the
selected conversation and active run cursor, each bound to `scopeKey`; messages, tool state, and drafts do
not become browser authority. Native stream readers are disposable inputs to the
session reducer.

Client tools are dynamic AI SDK tool calls. The widget checks
`hostBridge.getCapabilities`, dispatches once through `dispatchToolCall`, and
posts the safe outcome to the durable workflow hook. Server tools never cross
into the host bridge. Omitting `getCapabilities` disables client tools; a
capability-provider failure stops the send with a fixed safe integration error.

`renderActivityItem` customizes normalized progress, reasoning, or tool activity.
It receives no provider, database, approval, or service-internal DTO.

## Boundary rules

- Do not import server frameworks, database libraries, provider SDKs, or service internals.
- Keep AI SDK stream mechanics inside workflow-chat entity/feature slices.
- Keep rendering separate from transport, execution, and approval authority.
- Treat `src/shared/ai/**` as quarantined copied visual primitives.

## Appearance

`styles.css` owns the scoped widget tokens. `src/shared/lib/widget-themes.ts`
owns the four supported light themes: Graphite, Sapphire, Sage, and Ocean.
Graphite is the default token set; the other themes bind through
`data-sidechat-theme` on the widget root. Appearance controls layer accent,
radius, density, elevation, text-scale, and typeface overrides over the selected
palette. React persists the selected ids and exposes them as
`data-sidechat-*` attributes; `styles.css` alone owns the corresponding design
values. Tailwind utilities consume those cascading tokens, so appearance presets
must not be implemented as React inline styles or duplicated TypeScript value
tables.

To add a theme:

1. add its id and public description to `WIDGET_THEMES`;
2. add matching widget-root and preview token blocks to `styles.css`;
3. run `widget-themes.test.ts`, which requires both blocks for every non-default
   theme;
4. verify the settings preview and a mounted widget in the browser.

## Tests

Unit and DOM tests live under `src`; browser scenarios live in
`test-harness/widget-harness/e2e`.

See [widget and host integration](../../docs/architecture/widget-and-host-integration.md)
and [stream profile](../../docs/architecture/stream-profile.md).
