# Widget And Host Integration

Read this when: editing the React widget, the host bridge, or the copied-UI quarantine.
Source of truth for: widget Feature-Sliced layers, the live-turn data flow, the host-bridge contract, and the `shared/ai` quarantine.
Not source of truth for: the turn lifecycle ([assistant-turn.md](assistant-turn.md)), protocol events ([runtime-and-protocol-events.md](runtime-and-protocol-events.md)), package roles ([system-map.md](system-map.md)), or iframe embedding ([../operations/embed-widget-iframe.md](../operations/embed-widget-iframe.md)).

The browser widget lives in `packages/side-chat-widget` (a React component) and `packages/host-bridge` (the seam to the host app). The host app renders `<SideChatWidget>` and hands it exactly one transport configuration. The native branch accepts `workflowChat`; the protocol-backed branch accepts `client` and may also receive a host bridge. Both branches share panel, theme, labels, open-state, and activity-rendering options, while protocol-specific conversation options remain on the `client` branch. The widget owns the chat UI; the host owns the page. This doc explains both live-turn paths, the widget's layers, the host-bridge contract, and one quarantined folder of copied vendor UI. The decisions behind this shape — iframe isolation, Effect-free by gate, the reads-vs-live data split, no client merge, light themes only — are recorded in [ADR 0012](../adr/0012-widget-architecture.md).

## Feature-Sliced layers

The widget uses Feature-Sliced Design (FSD): code sits in ranked layers, and a layer may import only from a same-or-lower rank. The public entry is `src/index.ts`, which re-exports only the widget API. There is **no `app` layer** — `src/app/` does not exist.

| Layer                    | Rank | Owns                                                                                                           | Example                                                    |
| ------------------------ | ---- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `widgets/side-chat`      | 3    | The composite root `SideChatWidget`, layout/view composition, query-client and model wiring, public props      | `src/widgets/side-chat/ui/side-chat-widget.tsx`            |
| `features/chat`          | 2    | Submission, run lifecycle, SSE consumption, protocol-to-state mapping, reconnect, activity sidebar             | `src/features/chat/model/use-widget-chat.ts`               |
| `features/workflow-chat` | 2    | Stable native chat sessions, selected-session subscription, send/stream/cancel state, typed transport errors   | `src/features/workflow-chat/model/`                        |
| `features/conversation`  | 2    | Sidebar, switcher, empty state, message/tool rendering                                                         | `src/features/conversation/ui/`                            |
| `features/panel`         | 2    | Panel open/close/resize, browser-local size persistence (`useWidgetPanelSize`), header chrome, closed launcher | `src/features/panel/ui/`, `model/use-widget-panel-size.ts` |
| `features/prompt`        | 2    | Composer/footer input                                                                                          | `src/features/prompt/ui/`                                  |
| `features/settings`      | 2    | In-panel settings view                                                                                         | `src/features/settings/ui/`                                |
| `features/theme`         | 2    | Theme and appearance state written to the widget root                                                          | `src/features/theme/model/`                                |
| `entities/conversation`  | 1    | API client, SSE reader, run client, activity stream, TanStack Query repository                                 | `src/entities/conversation/api/`                           |
| `entities/workflow-chat` | 1    | Native transport adapter, history validation, request-time auth, cancel client                                 | `src/entities/workflow-chat/`                              |
| `entities/chat`          | 1    | Protocol-backed message and activity-timeline state                                                            | `src/entities/chat/model/`                                 |
| `entities/activity`      | 1    | Transport-neutral public activity-rendering contract                                                           | `src/entities/activity/model/`                             |
| `entities/panel`         | 1    | Panel size model                                                                                               | `src/entities/panel/model/`                                |
| `entities/settings`      | 1    | Shared settings metadata                                                                                       | `src/entities/settings/model/`                             |
| `entities/theme`         | 1    | Theme ids and metadata (`WidgetThemeId`)                                                                       | `src/entities/theme/model/`                                |
| `shared/ui`              | 0    | Project-owned reusable primitives                                                                              | `src/shared/ui/`                                           |
| `shared/lib`             | 0    | Browser-safe utilities                                                                                         | `src/shared/lib/`                                          |
| `shared/ai`              | 0    | Quarantine: copied vendor UI, now only a Markdown wrapper                                                      | `src/shared/ai/`                                           |

### Import-direction rule

`scripts/check-widget-layers.mjs` enforces direction by numeric rank (`layerRank`, :176). The rules:

- **Down or sideways only.** A layer imports only same-or-lower rank (`validateLayerDirection`, :143). A higher-rank import fails.
- **No cross-slice imports.** One feature (or entity) must not reach into a sibling slice (:151-158).
- **Entities stay narrow.** An entity imports only its own slice or `shared` (`validateEntityImport`, :163).
- **Shared is leaf-only.** `shared` imports only `shared` and **no `@side-chat/*` product package** (:58, :171).
- **The entry is locked.** `src/index.ts` may export only the side-chat widget (`validatePublicEntrypoint`, :72).

Cross-slice access goes through `#`-alias barrels, declared in `package.json` (`#entities/*`, `#features/*`, `#shared/lib/*`, `#shared/ai/*`, `#shared/ui/*`). Each resolves to a slice's `index.ts`, so a deep relative import into another slice fails the check.

The widget is provider-free and Effect-free. The isolated `workflow-chat` slices may import the AI SDK's browser-safe stream types/helpers from `ai` and transport from `@ai-sdk/workflow`, plus browser-safe `chat-protocol` contracts such as turn activity. `@ai-sdk/react` is not part of the widget runtime: no `Chat`/`useChat` store may co-own conversation state. Provider SDKs, Hono, database libraries, Effect, and runtime/service internals remain forbidden. The protocol-backed and Workflow branches share only explicit browser contracts; neither may reach into the other's state implementation. `scripts/check-runtime-boundaries.mjs` and the workflow import test guard these boundaries.

## Native v7 live-turn data flow

The native branch is still pre-cutover. Steps [16](../../plan/v7/16-widget-recovery-multitab.md) and [16a](../../plan/v7/16a-widget-parity-verification.md) remain open. The approved protocol-backed implementation is the parity baseline for session lifetime and multi-tab behavior: generation is not owned by whichever conversation panel happens to be mounted, navigation never cancels a background turn, query refresh never destroys live state, and every open tab receives subject-scoped activity changes. Conversation selection remains independent of the URL and idle browser persistence.

`GET /api/conversations` returns the authenticated subject's catalog. Running state comes from `GET /api/activity`: after registering the subscriber, the service emits one complete `sidechat.turn-activity-sync` frame and then live transitions. The sync frame replaces the widget's running-id set even when empty; transition frames update it. Production fan-out is driven by database notifications so turns started on another service instance are visible; the in-memory adapter publishes the same contract locally. Catalog and activity are presentation inputs, never selection persistence.

Both transports compose `SideChatPanelView`. It owns settings-open state, sidebar, header, narrow switcher, labels, and New chat/select/refresh controls; the protocol feed/footer and native workflow content remain transport-specific slots. Running state is conversation-scoped presentation. It may disable a duplicate send for that conversation, but it must not disable New chat, selecting another conversation, closing the widget, or returning to the running conversation.

All native workflow reads share the exported `WORKFLOW_CHAT_QUERY_SCOPE` TanStack Query prefix. A selected persisted conversation is bootstrapped and refetched through `GET /api/conversations/:conversationId/state`, one coherent resource containing validated messages plus its active turn. Refresh invalidates that snapshot, catalog, model, tool, and service-capability reads. It does not remount or replace an active native chat session. An idle persisted conversation may reconcile to refetched history; a local draft remains New chat and selection never changes as a side effect of refresh.

The `workflowChat` branch reads `/api/conversations/:conversationId/state` only for server-known conversations and validates its history as native `UIMessage[]`. A local draft starts an empty session without a durable snapshot. A widget-lifetime registry owns one conversation aggregate per conversation outside the selected panel's React lifetime. Its reducer is the only browser authority for the visible timeline and lifecycle. A disposable attachment epoch opens `WorkflowChatTransport`, consumes progressive projections with `readUIMessageStream`, and dispatches them into that reducer; React observes only the aggregate. Closing the widget, selecting another conversation, opening New chat, or changing settings therefore cannot dispose a live request. Live or idle sessions accept a newer coherent snapshot only through the same reducer handoff.

`workflowActiveTurnStorageKey` names only the focused tab's hard-refresh recovery pointer. Service acceptance records `{ conversationId, runId }` when that conversation is still foreground; selecting New chat or another idle conversation clears the pointer without cancelling the background session; a terminal clears a matching pointer. A hard refresh uses the pointer to choose the recovery conversation, but the coherent service snapshot decides whether a run is still active. A stale pointer is cleared without changing that persisted selection, so terminal history remains visible for that recovery load. The next idle refresh has no pointer and returns to New chat. The activity stream supplies cross-tab running indicators and reconciliation hints; it does not persist selection or content.

One widget-lifetime registry owns one native session aggregate per conversation. Each session reducer has an explicit synchronization lifecycle: `reattaching`, submitted/streaming, `settling`, then idle or error. During `reattaching` it renders the same open **Thinking...** pending trace as a fresh run and keeps Stop available; the UI never presents a known running turn as idle. Promoting a local draft after service acceptance does not unmount that registry-owned session while its first durable state read is pending. A same-run snapshot merges durable message progress monotonically without replacing the live epoch, so refresh cannot erase a partial answer while replay catches up. A terminal or different-run snapshot disposes the obsolete epoch before handoff. A terminal live transcript remains visible through `settling` until a newer authoritative snapshot contains the terminal assistant projection. This reconciliation is specified by [ADR 0017](../adr/0017-native-conversation-reconciliation.md).

Durable history owns the visible result after every terminal. Before atomic finalization, the service reads the closed Workflow journal and rebuilds the complete browser-safe native assistant message already published to the browser: text, reasoning, tool lifecycle, approval state, attributed sources, and step boundaries. The provider result remains authoritative for completed status, finish reason, and usage; its message content is only a fallback when the journal contains no visible parts. Failed, timed-out, and user-cancelled turns use the same projection, which is safely partial in those cases. Current registered server-tool schemas validate structured parts at the history-read boundary; removed or incompatible tool parts degrade through the existing history-drift policy. A reload therefore reconstructs completed and interrupted activity without depending on route-process or browser memory. Empty interrupted output creates no empty assistant row. Content-filtered output remains excluded rather than being recovered from the journal.

`createWorkflowChatTransport` binds `WorkflowChatTransport` to the service envelope. Every send and reconnect resolves `getRequestConfig()` at request time, while only a new send or regenerate may collect host page context. A send creates one `requestId`, asks the registered provider for a fresh snapshot with that id only when the user enabled **Include page context**, then POSTs the strict `{requestId, conversationId, messages, modelPreference?, reasoningEffort?, hostContext?, enabledToolNames?}` body to `/api/chat`. Reconnect, replay, cancel, approval, and client-tool-result requests never recollect page context. Provider failure rejects before the chat request is sent. Each attachment epoch explicitly supplies its abort-controller signal to send or reconnect so the aggregate can retire an obsolete reader. The stream consumer processes every native part in order, but a packed replay publishes only the newest cumulative `UIMessage` projection once per bounded paint slice. That preserves text, reasoning, approvals, and client-tool inputs while preventing one React render per historical token; a sparse live tail still paints on its next part.

The native widget reads authenticated `/api/capabilities` and `/api/tools` catalogs through TanStack Query. **Include page context** appears in the `+` menu only when the service publishes `hostContext.enabled = true` and the embedding app registered a callable context provider. It defaults off, remains an in-memory composer preference for the mounted widget, and is forced off if either prerequisite disappears. The server rejects a supplied `hostContext` while the capability is disabled; it never silently accepts or drops data that deployment policy forbids. The tool catalog remains independent: its enabled subset is optional when unavailable or empty, and an explicit `[]` disables every returned tool for that turn. The service intersects names with its trusted catalog, so the browser can only narrow authority; client-tool names may not collide with any registered server tool. Stop latches cancel intent and POSTs `{conversationId}` to `/api/chat/:runId/cancel`; it does not retire the active reader or hide Thinking/partial output. The stream or a newer durable snapshot remains the terminal authority, so cancelled state appears only after the server confirms it.

Registered server tools may define a trusted `readSources` projection over their own output. The workflow computes that serializable projection beside tool execution, then a dedicated Workflow step writes the URLs as durable native source parts. Live streaming, terminal history, and replay therefore render the same message-level sources fold; the browser never guesses a tool-specific result schema.

The workflow branch projects validated native `UIMessage` parts in source order: text and reasoning, static or dynamic tool lifecycles, approval decisions, sources, sanctioned files, and terminal notices. Reasoning and non-approval tools are normalized to the widget-owned `SideChatActivityItem` before an optional `renderActivityItem` callback; no AI SDK part crosses that public seam. Tool-detail policy is evaluated before customization (`hidden` drops, `name` stays compact, `full` may customize), and approval cards never yield to the callback. Thinking is present and expanded by default for both live and completed conversations; the user may collapse a trace locally, but no settings policy hides completed thinking. Reasoning text and answer text both use `MarkdownContent`, including streaming-safe parsing. Completed native traces read their replay-safe `activityDurationMs` metadata and use the same rounded `Thought for Ns` label as the legacy path; older messages without the field retain `Thought process`. Native message metadata also carries the browser-safe terminal projection used for reload reconstruction; internal provider and database error codes never cross that schema. Completed assistant text in both widget paths uses the shared Copy action; streaming or empty answers do not expose it. `SideChatDataParts` is empty, so no widget-owned `data-*` vocabulary is introduced. An optional `hostBridge` advertises page capabilities as the request's native client-tool catalog.

Dynamic `onToolCall` callbacks execute once per unsettled call and post a safe outcome to the durable result endpoint; settled replay parts never execute again. Approval cards post approve or deny decisions to the service, which resumes the durable hook. An approve click immediately projects the existing tool row as running while delivery is in flight; a failed decision request replaces that optimistic state with the safe failure state. The widget does not call `addToolOutput` or configure `sendAutomaticallyWhen`, so continuation remains server-owned.

The projection ignores unknown future parts with a development-build console note and bounds rendering at the observed terminal part count. Step 16 requires a deterministic proof with both tabs already open before generation: the watcher receives the activity transition without manual refresh, selection and close/reopen do not interrupt the sender, refresh preserves the live session, and both tabs converge after replay. Retry exhaustion/manual reconnect and the remaining Step 16 edge cases are still open.

## Protocol-backed live-turn data flow

Chat is connection-bound (ADR [0007](../adr/0007-connection-bound-streaming.md)): `client.createRun` POSTs the turn and the response _is_ its SSE stream — the `sidechat.started` frame at sequence 0 carries the identity. `GET /chat/turns/:assistantTurnId/stream?after=<seq>` can resume only from the owning instance's live buffer. Generation is server-owned and the browser only subscribes. If a reconnect or reload cannot reach that buffer, the widget polls the durable turn status and reads the final answer from history. See [runtime-and-protocol-events.md](runtime-and-protocol-events.md) for the transport contract.

Inbound events flow through four stages, each pure or single-purpose:

1. **SSE reader.** `decodeChunkedSseStream` (`entities/conversation/api/sse/side-chat-sse-reader.ts:18`) parses bytes into frames, decodes each via `chat-protocol`, and enforces stream invariants — increasing `sequence` and exactly one terminal event. A trailing partial frame throws `malformed_stream`; no terminal throws `missing_terminal`.
2. **Module-level run store.** `getWidgetRunStore(key)` (`features/chat/model/run/widget-run-store.ts:81`) holds one active run per instance, keyed by `{storageKey, baseUrl}`. It lives outside React, so live-turn state survives remounts and pane switches. Stale dispatches drop when `state.requestId !== requestId` (:50); components read it through `useSyncExternalStore`.
3. **Pure reducer.** `widgetRunReducer(state, action)` (`widget-run-reducer.ts:39`) folds each action into new state. The `event` action is the keystone: `applyEvent` is idempotent by `sequence` and ignores events once the run is terminal, so a replayed reconnect is safe.
4. **Projection.** `projectEventOntoMessages` (`widget-run-projection.ts`) shapes the message list: `delta` appends text; `activity` folds into the message's activity timeline; `error`/`blocked`/`completed` close the assistant bubble.

Protocol-backed activity state remains internal to `entities/chat`. Before the public renderer runs, `features/conversation` adapts each eligible item to the same `SideChatActivityItem` consumed by the workflow branch. Default protocol rendering still reads its richer internal state, so public customization does not widen or replace the protocol contract.

`useWidgetChat` (`use-widget-chat.ts:25`) is the composition root. It shows live run messages when a run is visible, else fetched history, and hands components already-shaped view state.

### TanStack Query vs the live stream

The widget uses TanStack Query for the conversation list, history, and model catalog (`useConversationQueryRepository`, `entities/conversation/api/query/`). It does **not** use Query for the live turn — that flows through the SSE reader, the run store, and the reducer described above. Keep the two paths separate.

### Outbound: user action to service

A submit walks from the composer to the service:

1. **Submit.** `useWidgetChatActions.startTurn` (`use-widget-chat-actions.ts:69`) creates optimistic user and assistant bubbles, calls `hostBridge?.getContext({requestId})` (:78), builds the request with `createWidgetChatRequest`, then calls `controller.startRun`.
2. **Begin run.** The controller claims the abort slot, seeds the store, and calls `client.createRun` (`POST /chat/runs`) — whose response is the turn's stream. The identity frame dispatches `identified` and writes the persisted reconnect marker exactly once (identity only, no cursor); it is cleared only on a server-confirmed terminal or a replaced run, never on a transport failure.
3. **Drive, with recovery.** `consumeTurnStreamWithRecovery` (`subscription/recovery/widget-transport-recovery.ts`) consumes that stream to the terminal, treating transport failures as _reconnecting_, not terminal: each attempt runs under its own controller with an inactivity watchdog (default 45 s — a wedged connection is cut, never a forever-locked composer), retryable failures re-open `client.subscribeTurn` from the store's cursor on a bounded backoff, and when retries exhaust — or the server answers `409 stream_unavailable` — it polls `client.getTurnStatus` until the server reports the terminal. Only a protocol violation, a 4xx, or persistent poll failure fails the run locally.
4. **Stop.** `controller.cancel` calls `client.cancelTurn` (`POST /chat/turns/:id/cancel`), then dispatches a `CANCELLED` terminal. Cancel is durable — the server acks it — not a fetch abort. Recovery notices the settled run and stands down.
5. **Reconnect.** Mount, tab-visibility, online, and conversation-select trigger resubscribe. An in-session reconnect resumes from the live cursor when it reaches the owner. A cold reload rebuilds from the persisted marker and attempts the same owner-bound resume; `stream_unavailable` or exhausted transport retries switch to status polling and terminal history. Cross-conversation "generating" dots come from `client.subscribeActivity` (`GET /chat/activity`). An activity event for the conversation a tab is **currently viewing** also refreshes that conversation's history (`useWidgetChat` `onEvent` → `refreshHistory`), so a turn started in another tab can discover its `activeTurn`; the dot alone never pulls in the turn's content.

Idempotency is load-bearing in three places that reconnect depends on: the `createRun` `requestId` key (no forked generation), the `after` replay cursor, and the reducer's sequence dedupe.

## Host bridge contract

The host bridge (`packages/host-bridge`, public API in `src/index.ts`) is the **browser seam**. Page context and browser-executed tools are separate optional capabilities: registering commands must not imply page-context access, and registering a page-context provider must not grant a command. The replacement service request schema and preparation pipeline accept bounded host context, keep it out of trusted/system channels, and preserve the exact user message for persistence and titles. Neither browser action is a backend RuntimeTool; a server-executed model tool needs a separate runtime registration.

`createHostBridge(options)` binds direct React integrations. A host registers its context callback as `contextProvider.getContext`; the widget-facing `WidgetHostBridge.getContext` exists only when that provider is registered. Capability and dispatch methods remain independently optional on the narrowed widget view. The provider is called at send time, after the user has opted in, so it observes the current page rather than a mount-time snapshot.

Page context has three independent gates, all of which must be true:

1. Deployment policy: the readable service config sets `hostContext.enabled: true`, and authenticated `/api/capabilities` publishes that fact.
2. Host integration: the direct host supplies `getContext`, or an iframe parent registers a provider through `registerIframeHostContextProvider` and the child connects through `connectIframeHostContextProvider`.
3. User intent: the composer `+` menu has **Include page context** enabled for the next send.

The first two gates control whether the menu row exists. The third controls whether the request contains `hostContext`. A context snapshot is reference data only; origin, URL, title, metadata, and collection timestamps never prove identity, authorization, tenant, workspace, or tool authority.

| Branch   | When                       | Method                                                                     | Owner in the widget                                        |
| -------- | -------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Protocol | Compatibility submit path  | `getContext({requestId})` returns context attached to the protocol request | `features/chat/model/use-widget-chat-actions.ts`           |
| Protocol | During stream consumption  | `dispatchCommand(event)` runs one legacy host-command activity             | `features/chat/model/subscription/`                        |
| Workflow | On opted-in send or retry  | `getContext({requestId})` returns context attached to the workflow request | `features/workflow-chat/model/use-workflow-widget-chat.ts` |
| Workflow | Before each send           | `getCapabilities()` supplies the native client-tool catalog                | `features/workflow-chat/model/use-workflow-widget-chat.ts` |
| Workflow | On a dynamic tool callback | `dispatchToolCall(call)` runs one capability-gated browser action          | `features/workflow-chat/model/client-tools/`               |

`dispatchCommand` runs **once per `activityId`**, only when an `ACTIVITY` event is a host-command event (guard at `widget-run-subscription.ts:69`). The result always folds back into the timeline:

- No bridge supplied: records a failed row with `host_bridge_unavailable` (:85).
- Dispatcher throws: records `host_command_exception` (:92).
- Otherwise: records the dispatcher's `HostCommandResult`.

Do not add ad-hoc retry around dispatch; a failed row is the recorded outcome.

The native branch has two dedupe guards. A settled `UIMessage` tool part is never dispatched, including after refresh or replay. An in-memory set keyed by `toolCallId` prevents a re-render from starting the same unsettled dispatch twice. Bridge exceptions and missing capabilities become failed outputs posted to the service instead of React errors.

### Iframe page-context registration

An iframe cannot receive a JavaScript callback prop from its parent and must not reach through `window.parent.document`. The public host-bridge package therefore owns a request/response `postMessage` adapter:

- The parent calls `registerIframeHostContextProvider` with the exact frame window, allowed frame origin, and provider callback before the frame connects.
- The child calls `connectIframeHostContextProvider` with the exact parent origin. A successful handshake yields the same provider interface used by direct embedding; no registration yields `undefined`, so the menu row stays hidden.
- Each opted-in send posts a correlated request. Replies must match request id, `event.source`, and exact origin. Timeouts and provider errors reject with a safe integration error and no chat request is sent.
- The parent returns a newly collected snapshot. The adapter validates the reply shape before it crosses into widget state; the service then applies its own independent size and trust-boundary validation.

This transport is capability plumbing, not authority. Same-origin development is supported, but origin and source checks remain mandatory so the production pattern also works when the parent and frame use different trusted origins.

## Copied-UI quarantine

`src/shared/ai/` holds copied vendor-style visual primitives, today only the Markdown/Streamdown wrapper for assistant messages. Older copied primitives were retired into project-owned `shared/ui`. See its [README](../../packages/side-chat-widget/src/shared/ai/README.md).

The quarantine keeps copied code swappable, so protocol, runtime, and business logic never leak into files that may be replaced wholesale. **Do not treat `shared/ai` as a style example for project code.**

Do not add to `shared/ai`:

- New message, composer, model, reasoning, conversation, or tool UI primitives.
- Side Chat business logic, protocol event mapping, or runtime/provider/tool/Effect knowledge.
- Persistence, auth, service, or host-command behavior.

Put project behavior in `widgets`, `features`, or `entities`. Put project-owned reusable primitives in `shared/ui` or `shared/lib`. The layer ranks plus the `shared`-cannot-import-`@side-chat/*` rule enforce this indirectly.

## Related checks

- `scripts/check-widget-layers.mjs`
- `scripts/check-runtime-boundaries.mjs`
- `scripts/check-human-readability.mjs`
