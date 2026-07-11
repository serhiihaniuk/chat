# Assistant Turn

Read this when: you need the order, durability, or failure rules of one assistant turn.
Source of truth for: the turn lifecycle, the pre-start/in-stream failure split, finalization, the in-memory event registry, replay/resume rules, cancel, and idempotency.
Not source of truth for: the `sidechat.v1` event vocabulary and SSE transport ([runtime-and-protocol-events.md](runtime-and-protocol-events.md)), package roles ([system-map.md](system-map.md)), or the streaming decision record ([ADR 0007](../adr/0007-connection-bound-streaming.md)).

## AI SDK 7 replacement service

The pre-alpha replacement under `apps/side-chat-service` deliberately uses a
different lifecycle while the legacy service remains available for comparison.
Its target is owned by [`plan/v7/05-turn-workflow-and-stream.md`](../../plan/v7/05-turn-workflow-and-stream.md)
until cutover: authenticated `POST /api/chat` starts a durable Workflow run and
returns its AI SDK UI-message stream; authenticated
`POST /api/chat/:runId/cancel` resumes the run's durable abort hook. Workflow
stores the live stream, execution journal, and recoverable terminal outcome.
The route process projects that outcome through application-owned persistence
ports before closing the response. Temporary Step 05 memory stores
model conversation ownership, the single-running-turn constraint, accepted user
messages, and terminal status until Steps 09 and 10 replace them with database
adapters. The legacy connection-bound lifecycle below remains authoritative
only for `apps/partner-ai-service` during this transition.

## Legacy service model

A turn is **server-owned and connection-bound** (ADR 0007). The browser starts
it; generation runs on a background fiber that outlives any socket. In-flight
events live in a per-instance, in-memory registry — the live stream is served
by the instance that runs the turn. Postgres holds the durable **final** state:
the conversation, messages, turn record and status, and cancel intent. A
reconnect or reload can replay only while it reaches the owning instance and
that instance still holds the buffer. Otherwise the widget waits for the
durable terminal status and reads the answer from history.

For shared terms (turn, terminal event, turn-event registry), see
[../domain/vocabulary.md](../domain/vocabulary.md).

## The HTTP surface

A turn starts and streams over **one call** (ADR 0007): the POST response _is_
the turn's SSE stream, which binds the stream to the owning instance by
construction. `sidechat.started` at sequence 0 carries the turn identity —
`assistantTurnId` on the envelope, `conversationId` on the event; the caller
already knows its `requestId`.

| Call                                                  | Runs                                                                                              | Returns                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /chat/runs`                                     | Pre-start synchronously, forks generation, then streams                                           | SSE from `sidechat.started` to the terminal; pre-start failures are JSON errors. A repeated `requestId` replays the existing turn's stream, or fails closed: `404 replay_expired` (finished, buffer swept) / `409 stream_unavailable` (running on another instance) |
| `GET /chat/turns/:assistantTurnId/stream?after=<seq>` | Same-instance resume: replay `sequence > after` from the registry, then tail live to the terminal | SSE; or JSON: `404` for unknown/cross-workspace/`replay_expired`, `409 stream_unavailable` for a running turn owned elsewhere, `400` for a malformed `after`                                                                                                        |

The shipped widget speaks this flow: `createRun` consumes the POST stream and
reads its identity from the started frame; `subscribeTurn` is its resume path.

Routes live in `apps/partner-ai-service/src/inbound/http/routes/chat/`: start
in `runs/chat-runs.ts`, stream in `turns/chat-turns.ts`.

Supporting routes (all workspace-scoped, in `turns/chat-turns.ts` unless noted):

- `GET /chat/runs/:requestId` → recover a lost POST reply: `{ assistantTurnId, status }`.
- `GET /chat/turns/:assistantTurnId` → JSON status snapshot.
- `POST /chat/turns/:assistantTurnId/cancel` → `{ assistantTurnId, cancelRequested }`.
- `POST /chat/turns/:assistantTurnId/host-commands/:commandId/result` → the browser posts a host-command result back to the awaiting turn (see [host-commands.md](host-commands.md)).
- `GET /chat/activity` → a separate subject-scoped SSE stream of cross-conversation turn lifecycle (the "generating" dot). Snapshot plus live transitions, no replay, no terminal. `routes/chat/activity/activity.ts`.

## Lifecycle stages

Stages 1-10 are **pre-start**: they run synchronously inside `POST /chat/runs`
and any failure rejects setup as JSON. Stage 1 is the HTTP route; stages 2-10
run in `prepareStreamChatTurn`
(`packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts`).
Stages 11-14 are **post-start**: they run on the forked fiber in
`runTurnGeneration` (`.../stream-chat/protocol/run-turn-generation.ts`).

|   # | Stage                                          | Proves / records / finalizes                                                           | Failure                                   |
| --: | ---------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
|   1 | Validate request                               | Method, auth, JSON, parsed `ChatStreamRequest`                                         | JSON `400`                                |
|   2 | Prove workspace authority                      | Subject may act in this workspace                                                      | Pre-start reject                          |
|   3 | Record request received                        | Correlation + observation before any runtime work                                      | Pre-start reject                          |
|   4 | Resolve the turn plan                          | Profile, validated model/reasoning, tools, executor, instructions, capability manifest | Pre-start reject                          |
|   5 | Run turn guards                                | Profile-selected guards before private context, persistence, or tools                  | Pre-start reject                          |
|   6 | Ensure authorized conversation                 | Load or create only a conversation this subject may access                             | Pre-start reject                          |
|   7 | Reject a concurrent conversation turn          | No assistant turn is already running for this conversation                             | `409 conversation_busy`                   |
|   8 | Append the user message                        | Store the user-visible message that starts the turn                                    | Pre-start reject                          |
|   9 | Start the turn record                          | Durable turn, status `running`; idempotent on `(workspace_id, request_id)`             | Pre-start reject **and** mark turn failed |
|  10 | Prepare and record context                     | History, host context, tool context, context manifest snapshot                         | Pre-start reject and mark turn failed     |
|  11 | Acquire lease, emit `sidechat.started` (seq 0) | Owner claims the lease, then the started event opens the stream                        | In-stream terminal                        |
|  12 | Execute the runtime                            | Run the executor; an `AbortController` lets a fiber interrupt abort the provider call  | In-stream terminal                        |
|  13 | Map events, append to the registry             | `RuntimeEvent` → `sidechat.v1`; each emitted event lands in the per-instance registry  | In-stream terminal                        |
|  14 | Finalize (always, via `onExit`)                | Write durable terminal status + assistant message; run post-success title generation   | See finalization                          |

The boundary sits after stage 10: `POST /chat/runs` forks post-start into a
`FiberMap` keyed by `assistantTurnId` — but only when the turn record was newly
inserted (`turn-runner.ts:93`) — and then turns its response into the turn's
SSE stream.

## Finalization owns the terminal

`runTurnGeneration` wraps the drain in `Effect.onExit`, so finalization runs on
every exit path: success, provider error, cancel, shutdown, and lease-fence
(`run-turn-generation.ts:52`). Terminal ownership splits by exit kind:

- **Normal terminal.** The stream emits `sidechat.completed`, `sidechat.error`,
  or `sidechat.blocked`; the drain appends it. `finalizeTurnGeneration` then
  writes the durable turn status and assistant message.
  `finalization/finalize-turn-generation.ts`.
- **No-terminal success.** A provider stream that just ends (no finish or error
  part) exits the drain successfully with no terminal: finalization appends the
  synthetic terminal first — so tailing subscribers close instead of hanging —
  and the status write then fails the turn honestly.
- **Abnormal exit.** No terminal reached the registry, so finalization appends
  exactly one synthetic terminal at `maxSequence + 1`, then writes the failure
  status (`finalize-turn-generation.ts:60`).
- **Interrupt after the stream's terminal.** The stream's terminal wins: a turn
  the user watched complete persists as completed with its assistant message —
  the late interrupt never re-terminalizes it (the registry's terminal guard
  also refuses any racing synthetic append).

`finalize-turn-generation.ts:116` classifies the abnormal terminal honestly
from the exit cause plus durable cancel intent:

| Exit cause               | Cancel intent?               | Status / code                         |
| ------------------------ | ---------------------------- | ------------------------------------- |
| Interrupt                | Yes (`cancel_requested_at`)  | `user_aborted` / `aborted`            |
| Interrupt                | No (shutdown or lease-fence) | `provider_failed` / `timeout`         |
| Defect or append failure | n/a                          | `provider_failed` / `provider_failed` |

`sidechat.blocked` is a terminal safety-stop, not an error. Title generation is
post-success enrichment, isolated; its failure is observed, never a second
terminal.

## Failure split

The split turns on one question: has the browser seen `sidechat.started`?

| Phase             | Started seen? | Behavior                                                        |
| ----------------- | ------------- | --------------------------------------------------------------- |
| Pre-start (1-10)  | No            | Reject setup as a JSON error to the caller                      |
| In-stream (11-14) | Yes           | Append exactly one terminal to the registry; no caller response |

`POST /chat/runs` maps pre-start failures in `chat-runs.ts`:
`PartnerAiCoreError` → its protocol code and HTTP status;
`ProtocolValidationError` → `400`; anything else → `500`. A failure at or after
stage 8 marks the started turn failed _and_ still rejects setup, so durable
state exists without half-opening a stream.

In-stream, a provider failure after `sidechat.started` is emitted as the
terminal `sidechat.error`; the protocol state machine drops any event after a
terminal (`protocol/protocol-stream-state-machine.ts:57`).

## Live transport: the in-memory registry

The live stream has no durable log. Core appends each mapped event to the
per-instance registry
(`apps/partner-ai-service/src/adapters/persistence/turn-events/in-memory-turn-event-log.ts`),
which doubles as the SSE dispatcher (`service-composition.ts` wires one object
as both).

| Mechanism            | What it does                                                                                                                                                                                                                                                                                               | Where                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Replay + tail        | A subscriber registers with the dispatcher first, replays `sequence > after` from the registry, then tails live behind a DENSE gate to the terminal: only the next sequence is emitted directly, and a gap (a dropped fan-out offer) triggers a re-read of the buffer so no event is ever permanently lost | `inbound/turn-stream/turn-subscription-stream.ts` |
| Per-subscriber queue | Each subscriber gets a bounded dropping queue; a low-frequency safety poll re-reads the registry as the missed-signal backstop                                                                                                                                                                             | `in-memory-turn-event-log.ts`                     |
| Terminal guard       | Once a terminal is recorded a turn's log is closed: later appends are no-ops, so a synthetic terminal racing a real one can never produce a second (the old durable log's partial-unique index, kept as a registry invariant)                                                                              | `in-memory-turn-event-log.ts`                     |
| Sweep                | Terminal, unwatched turns are dropped from the registry lazily when the next turn starts on that instance                                                                                                                                                                                                  | `in-memory-turn-event-log.ts`                     |

Consequences of connection-bound transport:

- **Same-instance resume works.** An in-session reconnect with
  `after=<lastSeenSequence>` replays the suffix from the registry and tails on.
- **Cross-instance and cross-restart resume do not exist.** The registry dies
  with the process. The widget's transport recovery retries the same instance
  from its cursor (bounded backoff + inactivity watchdog); when that cannot
  work it polls turn status until the server reports the terminal, then reads
  the result from conversation history.
- **Non-owner requests fail fast.** A stream request for a _running_ turn that
  this instance's registry does not hold answers `409` with the transport code
  `stream_unavailable` (`reason: not_stream_owner`) instead of opening an SSE
  that would never produce data. The client polls turn status until the
  terminal lands in history.
- **Only the owner registers turns.** `POST /chat/runs` registers a fresh turn
  in the registry before its response subscribes; subscribing never creates an
  entry, so a foreign or swept turn is a typed miss, not a permanent ghost
  entry.

## Replay expiry

A swept turn can no longer replay, so the stream route fails closed _before_
opening SSE for **terminal** turns: it returns the `replay_expired` JSON error
with HTTP `404` (`turns/chat-turns-resumability.ts`, `chat-turns.ts`). The
widget maps `replay_expired` to a history fallback — it refetches the
conversation and clears the run. A **running** turn never returns
`replay_expired` — the non-owner case is `409 stream_unavailable` instead. A
terminal turn that is still buffered serves its replay and ends without
tailing, so a cursor at or past the terminal sequence closes immediately.

## Durability and crash recovery

What Postgres durably holds: conversations, user and assistant messages, the
turn record and status, usage, context snapshots, audit events, and cancel
intent. When turn-activity history is enabled (the default; `history.turnActivity`
in `sidechat.config.ts`), a completed turn also stores its activity trace —
reasoning summaries, tool calls, host commands, as the protocol activity events —
in the assistant message's metadata, and history reads return it as
`HistoryMessage.activity` so a reloaded transcript replays the thinking. What
Postgres does not hold: the in-flight event stream.

Generation acquires an owner lease and renews it on a heartbeat
(`protocol/lease/turn-lease-heartbeat.ts`); a transient renew failure is
retried with a short backoff, but a renew that succeeds and matches no row
means the owner was fenced, and the drain self-interrupts. Clean shutdown
interrupts generation first — each `onExit` finalizes — then tears down the
reaper and dispatchers (SIGTERM/SIGINT in `server.ts`).

A hard crash (not a clean shutdown) cannot finalize, so every instance runs a
reaper sweep (`turn-runner/maintenance/turn-reaper.ts`, cadence
`reaperInterval`): it terminalizes running turns whose lease expired — or whose
lease was never acquired and whose `started_at` is past a grace of 2× the lease
TTL — with honest classification (cancel intent → `user_aborted`, else
`provider_failed`) and the activity NOTIFY in the same transaction, so the
"generating" dot clears live and the conversation accepts new turns again.
Concurrent sweeps claim disjoint rows (`FOR UPDATE SKIP LOCKED`), so no leader
election. The full crash-recovery design — breadcrumbs, sweep, epoch fencing,
client convergence — is
[ADR 0008](../adr/0008-crash-recovery-lease-sweep.md).

## Cancel

`POST /chat/turns/:assistantTurnId/cancel` is durable intent plus interruption
(`chat-turns.ts`). `requestTurnCancellation` CAS-sets `cancel_requested_at` and
`pg_notify`s a cancel channel in one transaction, so cancelling a finished,
unknown, or cross-workspace turn is a no-op ack. The route interrupts the local
fiber directly; a cancel dispatcher interrupts the owning fiber on a remote
instance. The fiber interrupt aborts the provider call for real (the
`AbortController` reaches the AI SDK), and finalization writes
`user_aborted` / `aborted`.

## Concurrency, idempotency edges, and fail-open telemetry

Pre-start rejects a second concurrent run in one conversation. After the
conversation is resolved, `guardConcurrentConversationTurn` reads the
conversation's in-flight turn (`findActiveConversationTurn`): a running turn from
a _different_ request means another tab or client is mid-turn, so the request
fails `conversation_busy` (HTTP 409) before any durable write; a running turn from
the _same_ request is that request's own idempotent retry and passes through. It
is best-effort — two genuinely simultaneous fresh requests can still both pass,
which lease fencing and the reaper already tolerate.

A conversationless request keys its conversation on the request id
(`conversationless:<requestId>`), not on the freshly minted fallback id, so a
retried create converges on one conversation instead of orphaning a new one each
attempt; the returned `conversationId` is the winning record's. Concurrent
`appendMessage`s to one conversation serialize on a `SELECT … FOR UPDATE` of the
conversation row before reading `max(sequence_index)`, so they never collide on
the sequence unique index.

Telemetry is fail-open: `recordStreamObservationEffect` swallows a sink failure
rather than rejecting the request or aborting generation (a sink runs on every
runtime event). A pre-start 5xx returns a generic body naming only the request id;
the real error, which may carry driver detail, goes to the diagnostic log. A
forked generation fiber's non-interrupt exit is logged with its turn id, so a
fault during generation or its finalizer is loud and reaper-recovered, never
silent.

## Connection resilience

The three cross-instance wake signals — cancel, turn activity, and host-command
result — each hold one dedicated Postgres `LISTEN` connection, separate from the
query pool so they survive PgBouncer transaction pooling. All three share one
reconnecting transport
(`repositories/postgres-drizzle/notifications/reconnecting-listen-source.ts`): it
registers node-postgres's `'error'` handler (an unhandled one crashes the
process), closes the dropped connection, and reconnects with jittered,
capped-exponential backoff. The query pool likewise logs its idle-client
`'error'` instead of faulting. So a Postgres restart or a load-balancer
idle-timeout no longer kills the service — the listeners re-establish and resume.

`NOTIFY` is only a poke, so a signal delivered while a listener was disconnected
would be lost. Each transport recovers differently: on every (re)connect the
cancel source re-scans running turns with durable `cancel_requested_at`
(`listRunningCancelRequestedTurns`) and re-feeds each as a synthetic cancel, so a
cancel from the outage still interrupts; activity subscribers re-read their
snapshot on their own reconnect; the host-command resolver polls the durable row.
The reaper remains the ultimate backstop for anything a reconnect misses.

## Idempotency

Idempotency is `requestId`-only. A repeated `(workspace_id, request_id)`
resolves to the existing turn record — a real unique constraint, not
check-then-insert — and does **not** fork a second generation, gated by
`turn.assistantTurn.inserted` (`turn-runner.ts:93`). No request-fingerprint or
`409`-on-mismatch path exists.

## Newcomer traps

- **The registry is not a durable log.** Do not build features that assume a
  turn's events survive a restart or exist on another instance. Final state
  comes from history.
- **Finalization is the runner's `onExit`, not a stream stage.** Durable
  terminal persistence lives in `run-turn-generation.ts`.
- **Normal vs abnormal terminal differ.** The stream's
  `completed`/`error`/`blocked` is appended by the drain; the synthetic terminal
  is appended only when the log would otherwise end without one (an abnormal
  exit, or a stream that ended terminal-less).
- **`replay_expired` is `404`, terminal-only.** A running turn never expires;
  a running turn owned elsewhere is `409 stream_unavailable`.
- **Generation is socket-independent.** Cancelling the SSE releases the local
  subscriber only; it never interrupts the fiber.

## Files to open

- `packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/run-turn-generation.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-stream-state-machine.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/finalization/finalize-turn-generation.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/lease/turn-lease-heartbeat.ts`
- `apps/partner-ai-service/src/inbound/turn-runner/turn-runner.ts`
- `apps/partner-ai-service/src/inbound/turn-stream/turn-subscription-stream.ts`
- `apps/partner-ai-service/src/adapters/persistence/turn-events/in-memory-turn-event-log.ts`
- `apps/partner-ai-service/src/inbound/http/routes/chat/runs/chat-runs.ts`
- `apps/partner-ai-service/src/inbound/http/routes/chat/turns/chat-turns.ts`
- `packages/db/src/repositories/postgres-drizzle/records/turn-lease.ts`
