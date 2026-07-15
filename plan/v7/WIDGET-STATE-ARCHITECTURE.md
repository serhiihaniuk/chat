# Widget Chat-State Architecture (Normative)

Read this when: building or reviewing any live/durable chat state in `packages/side-chat-widget` — the timeline, streaming, refresh, reconnect, cancel, or multi-tab behavior.

Source of truth for: who owns conversation state on the client, how the native stream is consumed, and the epoch/reducer/snapshot model.

Not source of truth for: server ownership ([`ARCHITECTURE.md`](./ARCHITECTURE.md), the durable turn), visual design (the design-system skill), or the wire vocabulary (`@side-chat/stream-profile`).

## The one law

**The widget owns exactly one authority for conversation state: a session aggregate that folds every input through one reducer.** Every other holder of state either derives from the aggregate or is disposable. No library, no React selection, no URL, and no component may be a second owner of the timeline or the turn lifecycle.

This is the model the Effect version had and shipped in hours: the client owned its reducer; the stream was input. It is not new. The v7 mistake was letting `@ai-sdk/react`'s `Chat` co-own message state, which forced `chat.messages = […]` overwrites and `ignoreNextFinishTerminal` suppression — two authorities fighting. This document removes that.

## Roles (server vs client)

The server owns the turn lifecycle and durable truth (see `ARCHITECTURE.md`): the run executes durably, terminal history is atomic in Postgres, and `readConversationState` returns one coherent `{messages, activeTurn}` observation. The client is a **pure projection** of that truth. It never manufactures a terminal; it observes the server's.

## Client pieces

| Piece                  | Owns                                                                               | Never                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Session aggregate**  | the visible timeline + lifecycle state; the sole authority; spawns/disposes epochs | wrap or defer to a library's message store                                            |
| **Reducer**            | the fold: `(state, event) → state`; dedup by message id; terminal-is-final         | hold anything the aggregate doesn't drive through it                                  |
| **Attachment epoch**   | one live reader of one `runId`'s stream; disposable                                | outlive its run; be mutated from outside; be spawned by anything but the aggregate    |
| **Snapshot client**    | fetching `readConversationState`; seeding the aggregate                            | merge two racing reads (`/messages` + `/active-turn` is banned — one atomic `/state`) |
| **Transport adapters** | thin fetch: POST send, GET reattach-stream, POST durable cancel                    | hold state                                                                            |

**The native stream is input only.** Consume it with `readUIMessageStream(stream)` (progressive `UIMessage` snapshots) or by parsing the documented UI-message-stream SSE spec directly — **zero `@ai-sdk/react` state ownership.** `Chat`/`useChat` is not used as an owner. If a `Chat` instance is used at all, it is a disposable per-epoch stream assembler whose output is copied once into the reducer and never read back as authority — but the clean path is to delete it and fold the native parts directly, exactly as the old reducer folded `sidechat.v1` events.

## The reducer contract

State the reducer owns:

- `messages`: ordered `UIMessage[]`, keyed and deduped by stable `id`.
- `turn`: `idle | streaming | settling | terminal`.
- `terminal`: `none | completed | cancelled | blocked | failed`.
- `transport`: `live | reconnecting | lost`.
- `pending`: approvals awaiting decision, client-tool calls awaiting dispatch (keyed by tool-call id).

Events into the reducer (the only way state changes):

- `SnapshotLoaded(messages, activeTurn)` — server truth; replaces the timeline, sets terminal from history.
- `PartReceived(part)` — one native stream part; folded by id/sequence.
- `StreamEnded(reason)` — the epoch's stream closed; marks `settling` (authority is still the server terminal).
- `TransportDropped` / `TransportRecovered` — display phase only; never terminal.
- `CancelRequested` — a display overlay; the real terminal arrives from the server.
- `EpochDisposed(runId)` — drop any live-only state for that run.

Reducer invariants (each a test):

1. **Dedup by id.** A part or message whose id is already present updates in place; it never appends a duplicate. This is what makes optimistic-send + server echo + reattach-replay all converge instead of duplicating.
2. **Terminal is final.** A part for an already-terminal turn is ignored.
3. **Cancel is display until confirmed.** `CancelRequested` shows a calm state; the timeline's terminal only becomes `cancelled` when the server says so (it may resolve `completed`/`failed` on the race).
4. **Reconnecting is never terminal.** A dropped transport is a phase, not an end.

## Data flows (exact)

**Send a new turn.** Aggregate mints a stable client message id, folds an optimistic user message (`PartReceived`/seed), POSTs to start the turn. The server persists the user message (reconciling that id) and returns `runId` + the stream. Aggregate opens an epoch for `runId` and folds parts. The optimistic message and the server's echo share the id → dedup, no duplicate bubble.

**Stream.** Each native part folds through the reducer by id. Text/reasoning/tool-lifecycle/`data-*`/error/finish/abort all enter as `PartReceived`; `finish`/`abort` produce `StreamEnded`.

**Refresh (cold load).** Aggregate mounts → GET `readConversationState` → `SnapshotLoaded(messages, activeTurn)`. If `activeTurn` is present, open an epoch for `activeTurn.runId`, reattach to the run's stream from the snapshot's high-water mark, fold forward — dedup guarantees the replayed prefix does not duplicate the snapshot. If absent, done; terminal comes from history.

**Reconnect (transport drop mid-stream).** The epoch's reader reconnects to the same `runId` from its last cursor; the reducer dedups the replayed tail. `transport = reconnecting` while it retries. After the configured retries, `transport = lost` with a manual retry that re-runs snapshot + reattach. The turn is never terminated by a dropped connection.

**Newer snapshot supersedes.** Aggregate disposes the current epoch (stops + unwires its reader), applies `SnapshotLoaded`, and — if the new snapshot reports an active run — opens a fresh epoch. Because the disposed reader is unwired, its late parts or terminal **cannot reach the reducer**. This is why no suppression flag exists: correctness is structural, not vigilant.

**Cancel.** Aggregate sends a durable cancel request for `runId` and dispatches `CancelRequested` (calm display). The authoritative terminal arrives from the server via the stream or the next snapshot. The aggregate observes it; it does not invent `cancelled`.

**Multi-tab.** Each tab has its own aggregate, epoch, and cursor over the same durable events; correctness comes from server idempotency + ordered state + id dedup, not from any tab being primary. Tab A's send is seen by Tab B through B's own reattach/poll and folded by id (stable id → merge, not duplicate). `BroadcastChannel` is an optional _hint_ to reconnect sooner; a broadcast is applied through the same dedup path and is never a substitute for server replay (it can be lost when a tab is suspended).

## Epoch lifecycle (the core discipline)

An **epoch** is one live attachment to one `runId`'s stream.

- **Born** by the aggregate on send, or on reattach to a snapshot's `activeTurn`.
- **Lives** folding that run's parts into the reducer.
- **Dies** — disposed by the aggregate — when a newer snapshot supersedes it, when the turn settles to terminal, or when the widget unmounts. Disposal stops and unwires the reader.
- **Only the aggregate** spawns or disposes epochs. If a React effect, a route change, a snapshot fetch on its own path, or a library callback can create or kill an epoch, you have a second lifecycle authority — the same bug in a new costume.

An epoch is immutable from outside: seeded at birth, never overwritten mid-life. Replacing a run means dispose + new epoch, never reaching into a live one.

## Anti-patterns (each is the disease, not a style nit)

1. **`chat.messages = […]`** or any reach into a component's internal store — proof the library co-owns messages. Delete the co-ownership; fold native parts into the reducer.
2. **A suppression flag** (`ignoreNextFinishTerminal`, "skip the next event") — proof you are arbitrating between two state machines. Collapse to one owner and the flag ceases to exist.
3. **Two parallel widget state trees** (`features/chat` + `features/workflow-chat`) — dual ownership at the directory level. One survives; the other is deleted, not kept as a fallback.
4. **Split refresh reads** (`/messages` + `/active-turn`) — two racing observations. Use the one atomic `readConversationState`.
5. **React selection / URL owning generation lifecycle** — routing is view state; it must not start, stop, or own a run.
6. **The client manufacturing a terminal** — cancel/finish authority is the server's; the client observes.

The test for all six: _am I composing with an input, or suppressing/overwriting a second owner?_ Composition is fine. Suppression means fix ownership first.

## Reuse, not rebuild

The old `features/chat/model/run/widget-run-reducer` already is this fold — dense-sequence dedup, terminal-is-final, calm cancel. The only change is its **input language**: it folded `sidechat.v1` events; it now folds native UI-message-stream parts (via `@side-chat/stream-profile` for the `data-*`/error vocabulary). Same shape, same guarantees. This is why the work is hours, not days: you are back on the reducer you own, off the library you were renting.
