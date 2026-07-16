# side-chat-widget

Read this when: editing the embeddable React widget.
Source of truth for: the widget public surface and browser-side boundaries.
Not source of truth for: service workflow or persistence details.

## Public surface

`SideChatWidget` has one native Workflow-backed API. Consumers pass
`workflowChat` with a service `baseUrl` and optional request-time auth resolver.
An optional `hostBridge` supplies page context and native client tools.

The widget owns:

- conversation selection, catalog queries, and coherent state reads;
- one session aggregate per persisted conversation;
- live AI SDK UI message stream projection and replay attachment;
- stop, reconnect, approval, and client-tool interactions;
- running-conversation activity from `GET /api/activity`;
- panel, theme, appearance, settings, and host-controlled open state.

The service snapshot is authoritative after reload. A tab may persist only the
selected conversation and active run cursor; messages, tool state, and drafts do
not become browser authority. Native stream readers are disposable inputs to the
session reducer.

Client tools are dynamic AI SDK tool calls. The widget checks
`hostBridge.getCapabilities`, dispatches once through `dispatchToolCall`, and
posts the safe outcome to the durable workflow hook. Server tools never cross
into the host bridge.

`renderActivityItem` customizes normalized progress, reasoning, or tool activity.
It receives no provider, database, approval, or service-internal DTO.

## Boundary rules

- Do not import server frameworks, database libraries, provider SDKs, or service internals.
- Keep AI SDK stream mechanics inside workflow-chat entity/feature slices.
- Keep rendering separate from transport, execution, and approval authority.
- Treat `src/shared/ai/**` as quarantined copied visual primitives.

## Tests

Unit and DOM tests live under `src`; browser scenarios live in
`test-harness/widget-harness/e2e`.

See [widget and host integration](../../docs/architecture/widget-and-host-integration.md)
and [stream profile](../../docs/architecture/stream-profile.md).
