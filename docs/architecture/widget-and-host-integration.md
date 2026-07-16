# Widget and Host Integration

Read this when: you embed the widget, provide host context, or expose browser-side tools.
Source of truth for: the public widget branch, host bridge responsibilities, recovery, and originating-tab authority.
Not source of truth for: visual tokens ([widget-design-system.md](widget-design-system.md)) or service tool execution ([client-tools.md](client-tools.md)).

## Public composition

`@side-chat/side-chat-widget` exports one public chat architecture. `SideChatWidget` receives `workflowChat` configuration and renders the Workflow-backed session; there is no alternate transport branch.

The widget owns:

- conversation selection, query caching, and authoritative history refresh;
- native AI SDK UI-message transport and projection;
- replay and active-turn recovery;
- model, reasoning, tool, and host-context selection UI;
- pending, streaming, settling, terminal, approval, and tool presentation;
- theme, density, panel, and activity rendering preferences.

The host application owns authentication material, service URL/configuration, page context, client-tool implementations, and where the widget is mounted.

## Host bridge

`@side-chat/host-bridge` is the browser integration boundary. It exports:

- `createHostBridge` / `WidgetHostBridge` for direct integration;
- typed host-context providers for direct and iframe embedding;
- `HostClientToolDefinition`, `HostToolCall`, and capability types;
- client-tool dispatch and normalized tool-result helpers.

The bridge does not know service routes, Workflow journals, AI provider types, database rows, or widget rendering state. It depends only on `@side-chat/shared` and browser primitives.

## Host context

The widget asks the bridge for optional page context selected by the user. Direct embedding may read context through a host callback. Iframe embedding uses the typed postMessage contract and validates message source/origin according to the integration configuration.

Host context is untrusted reference material:

- the service enforces explicit string, collection, nesting, entry, and total-size limits;
- accepted context augments only the execution copy of the latest user message;
- it never becomes authentication, authorization, workspace ownership, or system instructions;
- it is not written as a separate product message.

## Client tools and originating-tab authority

A host may register browser-side tools with the bridge. At turn start, the widget creates a high-entropy raw capability secret for that tab and request. The HTTP boundary hashes it; only the digest is stored with the durable tool authority and Workflow input. The raw value remains in the originating tab's live cursor.

When a client-tool input appears in the native stream:

1. the widget verifies that the active cursor still owns the raw capability;
2. the bridge dispatches the call to the registered host tool;
3. the widget submits the normalized result to `POST /api/chat/:runId/tools/:toolCallId/output` with the raw capability header;
4. the service authorizes the capability before reading or accepting the result body;
5. the Workflow resumes the matching durable wait exactly once.

A second tab or passive watcher can replay and render the tool state but cannot execute it because it does not possess the raw capability. Reloading the originating tab intentionally loses execution authority; recovery continues as a watcher unless the durable turn reaches another terminal path.

See [client-tools.md](client-tools.md) for the service-side authority and wait protocol.

## Recovery and reconciliation

The widget persists a small active-turn cursor, not the stream content. On mount or reconnect it:

1. loads the authoritative conversation snapshot;
2. validates the stored cursor against the conversation and active `runId`;
3. resumes from the last confirmed public chunk index when the run is active;
4. enters `settling` after stream terminal;
5. refreshes until the durable terminal assistant projection appears, then clears the cursor.

Stale, cross-conversation, malformed, or terminal cursors are discarded. The conversation snapshot is authoritative; local storage never creates execution or ownership authority.

The separate activity SSE feed refreshes conversation-list indicators and snapshots. It does not replace the chat stream or the authoritative conversation query.

## Rendering extension

`renderActivityItem` may replace eligible, already-normalized activity rows. It receives widget-owned `SideChatActivityItem` values and may return a React node or `undefined` to keep the default rendering. It cannot authorize tools, alter Workflow state, bypass approval UI, or access private provider detail.

## Package boundaries

- Widget business logic stays in the Feature-Sliced layers under `packages/side-chat-widget/src`.
- `packages/side-chat-widget/src/shared/ai/**` is quarantined copied UI code, not a location for Side Chat domain logic.
- Browser packages remain free of Node-only modules, database clients, Workflow internals, and provider SDK DTOs.
- Cross-package imports use public package exports.

## Primary implementation anchors

- `packages/side-chat-widget/src/widgets/side-chat/`
- `packages/side-chat-widget/src/entities/workflow-chat/`
- `packages/side-chat-widget/src/features/workflow-chat/`
- `packages/host-bridge/src/bridge/`
- `packages/host-bridge/src/context/`
- `packages/host-bridge/src/tools/`
