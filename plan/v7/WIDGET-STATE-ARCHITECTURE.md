# Widget Chat-State Architecture (Normative)

Read this when: building or reviewing any live/durable chat state in `packages/side-chat-widget` — the timeline, streaming, refresh, reconnect, cancel, or multi-tab behavior.

Source of truth for: who owns conversation state on the client, how the native stream is consumed, and the epoch/reducer/snapshot model.

Not source of truth for: server ownership ([`ARCHITECTURE.md`](./ARCHITECTURE.md), the durable turn), visual design (the design-system skill), or the wire vocabulary (`@side-chat/stream-profile`).

## The one law

**The widget owns exactly one authority for conversation state: a session aggregate that folds every input through one reducer.** Every other holder of state either derives from the aggregate or is disposable. No library, no React selection, no URL, and no component may be a second owner of the timeline or the turn lifecycle.

The approved protocol-backed implementation established the same ownership rule: the client owns its reducer and treats the stream as input. The rejected native implementation let a library store co-own message state, which required message overwrites and finish-suppression flags. The replacement keeps one aggregate authority instead.

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

**The native stream is input only.** The disposable attachment engine uses `WorkflowChatTransport` and `readUIMessageStream(stream)` to assemble cumulative `UIMessage` projections. It publishes those projections through callbacks into the aggregate reducer and owns no durable conversation state. `@ai-sdk/react`, `Chat`, and `useChat` are forbidden in the widget runtime.

## The reducer contract

State the reducer owns:

- `messages`: ordered `UIMessage[]`, keyed and deduped by stable `id`.
- `activeRunId` and `activeEpoch`: durable run identity plus the one disposable reader currently allowed to project it.
- `turn`: `idle | streaming | settling | terminal`.
- `terminal`: `none | completed | cancelled | blocked | failed`.
- `transport`: `live | reconnecting | lost`.
- `pending`: approvals awaiting decision, client-tool calls awaiting dispatch (keyed by tool-call id).

Events into the reducer (the only way state changes):

- `SnapshotLoaded(messages, activeTurn, observationId)` — one atomic server observation. A different or terminal run replaces the timeline; a snapshot for the same live run merges by message id and keeps the longer visible projection while replay catches up.
- `OptimisticMessageAdded(message)` — seeds the stable client message id before acceptance.
- `AttachmentStarted(epochId, runId?)` / `RunAccepted(epochId, runId)` — bind the disposable reader, then its durable identity.
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
5. **Same-run snapshots are monotonic.** Refresh may add durable progress but cannot shorten the visible text or parts already produced by the live epoch.
6. **Epoch identity fences late work.** Every stream event carries `epochId`; a disposed or replaced epoch cannot mutate the reducer.

## Data flows (exact)

**Send a new turn.** Aggregate mints a stable client message id, folds an optimistic user message (`PartReceived`/seed), POSTs to start the turn. The server persists the user message (reconciling that id) and returns `runId` + the stream. Aggregate opens an epoch for `runId` and folds parts. The optimistic message and the server's echo share the id → dedup, no duplicate bubble.

**Stream.** The attachment engine reads native parts in order and assembles cumulative `UIMessage` projections. It publishes the newest projection in each bounded browser slice as `PartReceived(epochId, message)`. Finish and abort are captured separately as `StreamEnded`; server error chunks remain lifecycle input and do not become transport failures.

**Refresh (cold load).** Aggregate mounts → GET `readConversationState` → `SnapshotLoaded(messages, activeTurn, observationId)`. If `activeTurn` is present, open an epoch for `activeTurn.runId` and reattach to the durable Workflow stream. Replay may contain the full visible prefix; message-id dedup plus monotonic same-run merge prevents duplication or regression. If no active turn exists, terminal comes from history and no epoch opens.

**Reconnect (transport drop mid-stream).** `WorkflowChatTransport` applies its bounded reconnect policy to the same `runId`. If that policy exhausts, the epoch reports `transport = lost`; manual retry re-reads the coherent snapshot and reattaches when the run is still active. Replay is cumulative and the reducer converges it by message id. A dropped connection never manufactures a turn terminal.

**Newer snapshot supersedes.** Aggregate disposes the current epoch (stops + unwires its reader), applies `SnapshotLoaded`, and — if the new snapshot reports an active run — opens a fresh epoch. Because the disposed reader is unwired, its late parts or terminal **cannot reach the reducer**. This is why no suppression flag exists: correctness is structural, not vigilant.

**Cancel.** Aggregate sends a durable cancel request for `runId` and dispatches `CancelRequested` (calm display). The authoritative terminal arrives from the server via the stream or the next snapshot. The aggregate observes it; it does not invent `cancelled`.

**Multi-tab.** Each tab has its own aggregate and disposable epoch over the same durable server state; no tab is primary. The authenticated activity feed carries identity-only invalidation hints. Each hint is resolved against the Workflow-backed active-turn join, then the tab refreshes the catalog or selected conversation and reconciles any retained offscreen session. Content still comes only from coherent snapshots and durable Workflow replay.

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
3. **Two state owners inside one transport path** — a library store plus the session aggregate is dual ownership. The pre-cutover protocol-backed and Workflow branches may coexist only as isolated transports behind the shared shell; Step 20 deletes the legacy branch at cutover.
4. **Split refresh reads** (`/messages` + `/active-turn`) — two racing observations. Use the one atomic `readConversationState`.
5. **React selection / URL owning generation lifecycle** — routing is view state; it must not start, stop, or own a run.
6. **The client manufacturing a terminal** — cancel/finish authority is the server's; the client observes.

The test for all six: _am I composing with an input, or suppressing/overwriting a second owner?_ Composition is fine. Suppression means fix ownership first.

## Reuse the contract, isolate the implementation

The protocol-backed reducer remains the behavioral reference for stable identity, terminal authority, calm cancellation, and transport recovery. The Workflow branch owns a dedicated reducer because its input is cumulative native `UIMessage` projection rather than sequenced `sidechat.v1` events. Shared presentation and explicit browser contracts are reused; reducer state and transport lifecycles are not shared across branches. Step 20 removes the protocol-backed branch after the native gate closes.
