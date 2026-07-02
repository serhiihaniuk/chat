# Widget And Host Integration

Read this when: editing the React widget, the host bridge, or the copied-UI quarantine.
Source of truth for: widget Feature-Sliced layers, the live-turn data flow, the host-bridge contract, and the `shared/ai` quarantine.
Not source of truth for: the turn lifecycle ([assistant-turn.md](assistant-turn.md)), protocol events ([runtime-and-protocol-events.md](runtime-and-protocol-events.md)), package roles ([system-map.md](system-map.md)), or iframe embedding ([../operations/embed-widget-iframe.md](../operations/embed-widget-iframe.md)).

The browser widget lives in `packages/side-chat-widget` (a React component) and `packages/host-bridge` (the seam to the host app). The host app renders `<SideChatWidget>`, hands it an API client, and optionally a host bridge. The widget owns the chat UI; the host owns the page. This doc explains the widget's layers, how a live turn flows from the network to the screen, the host-bridge contract, and one quarantined folder of copied vendor UI. The decisions behind this shape — iframe isolation, Effect-free by gate, the reads-vs-live data split, no client merge, light themes only — are recorded in [ADR 0012](../adr/0012-widget-architecture.md).

## Feature-Sliced layers

The widget uses Feature-Sliced Design (FSD): code sits in ranked layers, and a layer may import only from a same-or-lower rank. The public entry is `src/index.ts`, which re-exports only the widget API. There is **no `app` layer** — `src/app/` does not exist.

| Layer                   | Rank | Owns                                                                                                           | Example                                                    |
| ----------------------- | ---- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `widgets/side-chat`     | 3    | The composite root `SideChatWidget`, layout/view composition, query-client and model wiring, public props      | `src/widgets/side-chat/ui/side-chat-widget.tsx`            |
| `features/chat`         | 2    | Submission, run lifecycle, SSE consumption, protocol-to-state mapping, reconnect, activity sidebar             | `src/features/chat/model/use-widget-chat.ts`               |
| `features/conversation` | 2    | Sidebar, switcher, empty state, message/tool rendering                                                         | `src/features/conversation/ui/`                            |
| `features/panel`        | 2    | Panel open/close/resize, browser-local size persistence (`useWidgetPanelSize`), header chrome, closed launcher | `src/features/panel/ui/`, `model/use-widget-panel-size.ts` |
| `features/prompt`       | 2    | Composer/footer input                                                                                          | `src/features/prompt/ui/`                                  |
| `features/settings`     | 2    | In-panel settings view                                                                                         | `src/features/settings/ui/`                                |
| `features/theme`        | 2    | Theme and appearance state written to the widget root                                                          | `src/features/theme/model/`                                |
| `entities/conversation` | 1    | API client, SSE reader, run client, activity stream, TanStack Query repository                                 | `src/entities/conversation/api/`                           |
| `entities/chat`         | 1    | Protocol-backed message and activity-timeline state                                                            | `src/entities/chat/model/`                                 |
| `entities/panel`        | 1    | Panel size model                                                                                               | `src/entities/panel/model/`                                |
| `entities/settings`     | 1    | Shared settings metadata (`ReasoningVisibility`)                                                               | `src/entities/settings/model/`                             |
| `entities/theme`        | 1    | Theme ids and metadata (`WidgetThemeId`)                                                                       | `src/entities/theme/model/`                                |
| `shared/ui`             | 0    | Project-owned reusable primitives                                                                              | `src/shared/ui/`                                           |
| `shared/lib`            | 0    | Browser-safe utilities                                                                                         | `src/shared/lib/`                                          |
| `shared/ai`             | 0    | Quarantine: copied vendor UI, now only a Markdown wrapper                                                      | `src/shared/ai/`                                           |

### Import-direction rule

`scripts/check-widget-layers.mjs` enforces direction by numeric rank (`layerRank`, :176). The rules:

- **Down or sideways only.** A layer imports only same-or-lower rank (`validateLayerDirection`, :143). A higher-rank import fails.
- **No cross-slice imports.** One feature (or entity) must not reach into a sibling slice (:151-158).
- **Entities stay narrow.** An entity imports only its own slice or `shared` (`validateEntityImport`, :163).
- **Shared is leaf-only.** `shared` imports only `shared` and **no `@side-chat/*` product package** (:58, :171).
- **The entry is locked.** `src/index.ts` may export only the side-chat widget (`validatePublicEntrypoint`, :72).

Cross-slice access goes through `#`-alias barrels, declared in `package.json` (`#entities/*`, `#features/*`, `#shared/lib/*`, `#shared/ai/*`, `#shared/ui/*`). Each resolves to a slice's `index.ts`, so a deep relative import into another slice fails the check.

The widget is provider-free and Effect-free. It must not import `ai`, `@ai-sdk/*`, `hono`, `pg`, `drizzle-orm`, Effect, or any runtime/service internal. Its only `@side-chat/*` dependencies are `chat-protocol`, `host-bridge`, and `shared`. `scripts/check-runtime-boundaries.mjs` guards this too.

## Live-turn data flow

Chat is connection-bound (ADR [0007](../adr/0007-connection-bound-streaming.md)): `client.createRun` POSTs the turn and the response _is_ its SSE stream — the `sidechat.started` frame at sequence 0 carries the identity. `GET /chat/turns/:assistantTurnId/stream?after=<seq>` is the same-instance resume. Generation is server-owned and the browser only subscribes, so an in-session reconnect resumes the same turn; after a reload or a lost stream, the final answer comes from conversation history once the turn is terminal. See [runtime-and-protocol-events.md](runtime-and-protocol-events.md) for the transport contract.

Inbound events flow through four stages, each pure or single-purpose:

1. **SSE reader.** `decodeChunkedSseStream` (`entities/conversation/api/sse/side-chat-sse-reader.ts:18`) parses bytes into frames, decodes each via `chat-protocol`, and enforces stream invariants — increasing `sequence` and exactly one terminal event. A trailing partial frame throws `malformed_stream`; no terminal throws `missing_terminal`.
2. **Module-level run store.** `getWidgetRunStore(key)` (`features/chat/model/run/widget-run-store.ts:81`) holds one active run per instance, keyed by `{storageKey, baseUrl}`. It lives outside React, so live-turn state survives remounts and pane switches. Stale dispatches drop when `state.requestId !== requestId` (:50); components read it through `useSyncExternalStore`.
3. **Pure reducer.** `widgetRunReducer(state, action)` (`widget-run-reducer.ts:39`) folds each action into new state. The `event` action is the keystone: `applyEvent` is idempotent by `sequence` and ignores events once the run is terminal, so a replayed reconnect is safe.
4. **Projection.** `projectEventOntoMessages` (`widget-run-projection.ts`) shapes the message list: `delta` appends text; `activity` folds into the message's activity timeline; `error`/`blocked`/`completed` close the assistant bubble.

`useWidgetChat` (`use-widget-chat.ts:25`) is the composition root. It shows live run messages when a run is visible, else fetched history, and hands components already-shaped view state.

### TanStack Query vs the live stream

The widget uses TanStack Query for the conversation list, history, and model catalog (`useConversationQueryRepository`, `entities/conversation/api/query/`). It does **not** use Query for the live turn — that flows through the SSE reader, the run store, and the reducer described above. Keep the two paths separate.

### Outbound: user action to service

A submit walks from the composer to the service:

1. **Submit.** `useWidgetChatActions.startTurn` (`use-widget-chat-actions.ts:69`) creates optimistic user and assistant bubbles, calls `hostBridge?.getContext({requestId})` (:78), builds the request with `createWidgetChatRequest`, then calls `controller.startRun`.
2. **Begin run.** The controller claims the abort slot, seeds the store, and calls `client.createRun` (`POST /chat/runs`) — whose response is the turn's stream. The identity frame dispatches `identified` and writes the persisted reconnect marker exactly once (identity only, no cursor); it is cleared only on a server-confirmed terminal or a replaced run, never on a transport failure.
3. **Drive, with recovery.** `consumeTurnStreamWithRecovery` (`subscription/recovery/widget-transport-recovery.ts`) consumes that stream to the terminal, treating transport failures as _reconnecting_, not terminal: each attempt runs under its own controller with an inactivity watchdog (default 45 s — a wedged connection is cut, never a forever-locked composer), retryable failures re-open `client.subscribeTurn` from the store's cursor on a bounded backoff, and when retries exhaust — or the server answers `409 stream_unavailable` — it polls `client.getTurnStatus` until the server reports the terminal. Only a protocol violation, a 4xx, or persistent poll failure fails the run locally.
4. **Stop.** `controller.cancel` calls `client.cancelTurn` (`POST /chat/turns/:id/cancel`), then dispatches a `CANCELLED` terminal. Cancel is durable — the server acks it — not a fetch abort. Recovery notices the settled run and stands down.
5. **Reconnect.** Mount, tab-visibility, online, and conversation-select triggers resubscribe. An in-session reconnect resumes from the live cursor; a cold reload rebuilds from the persisted marker. Cross-conversation "generating" dots come from `client.subscribeActivity` (`GET /chat/activity`). An activity event for the conversation a tab is **currently viewing** also refreshes that conversation's history (`useWidgetChat` `onEvent` → `refreshHistory`), so a turn started in another tab resumes its live stream here via the history read's `activeTurn` — the dot alone never pulls in the turn's content.

Idempotency is load-bearing in three places that reconnect depends on: the `createRun` `requestId` key (no forked generation), the `after` replay cursor, and the reducer's sequence dedupe.

## Host bridge contract

The host bridge (`packages/host-bridge`, public API in `src/index.ts`) is the **browser seam**: host context flows in, host commands flow out. Host commands are browser UI actions the host app performs — **not** backend RuntimeTools. A model-callable backend action needs a separate RuntimeTool with its own manifest, approval policy, and registration.

`createHostBridge(options)` (`bridge/bridge.ts:28`) returns a `HostBridge` of `{getContext, getCapabilities, dispatchCommand}` (:16). The widget consumes a narrowed view of it.

| Direction   | When                      | Method                                                                        | Where the widget calls it       |
| ----------- | ------------------------- | ----------------------------------------------------------------------------- | ------------------------------- |
| Context in  | On every submit/retry     | `getContext({requestId})` returns a `HostContext` attached to the run request | `use-widget-chat-actions.ts:78` |
| Command out | During stream consumption | `dispatchCommand(event)` runs one host-command activity event                 | `widget-run-subscription.ts:55` |

`dispatchCommand` runs **once per `activityId`**, only when an `ACTIVITY` event is a host-command event (guard at `widget-run-subscription.ts:69`). The result always folds back into the timeline:

- No bridge supplied: records a failed row with `host_bridge_unavailable` (:85).
- Dispatcher throws: records `host_command_exception` (:92).
- Otherwise: records the dispatcher's `HostCommandResult`.

Do not add ad-hoc retry around dispatch; a failed row is the recorded outcome.

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
