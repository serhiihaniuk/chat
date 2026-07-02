# Assistant Turn

Read this when: you need the order, durability, or failure rules of one assistant turn.
Source of truth for: the turn lifecycle, the pre-start/in-stream failure split, finalization, the in-memory event registry, replay/resume rules, cancel, and idempotency.
Not source of truth for: the `sidechat.v1` event vocabulary and SSE transport ([runtime-and-protocol-events.md](runtime-and-protocol-events.md)), package roles ([system-map.md](system-map.md)), or the streaming decision record ([ADR 0007](../adr/0007-connection-bound-streaming.md)).

## The one-paragraph model

A turn is **server-owned and connection-bound** (ADR 0007). The browser starts
it; generation runs on a background fiber that outlives any socket. In-flight
events live in a per-instance, in-memory registry — the live stream is served
by the instance that runs the turn. Postgres holds the durable **final** state:
the conversation, messages, turn record and status, and cancel intent. A reload
does not replay a live stream; it reads history from the DB once the turn is
terminal.

For shared terms (turn, terminal event, turn-event registry), see
[../domain/vocabulary.md](../domain/vocabulary.md).

## The HTTP surface

A turn starts and streams over **one call** (ADR 0007): the POST response _is_
the turn's SSE stream, which binds the stream to the owning instance by
construction. `sidechat.started` at sequence 0 carries the turn identity —
`assistantTurnId` on the envelope, `conversationId` on the event; the caller
already knows its `requestId`.

| Call                                                  | Runs                                                                                              | Returns                                                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /chat/runs`                                     | Pre-start synchronously, forks generation, then streams                                           | SSE from `sidechat.started` to the terminal; pre-start failures are JSON errors. A repeated `requestId` replays the existing turn's stream (or `404 replay_expired` if its buffer was swept) |
| `GET /chat/turns/:assistantTurnId/stream?after=<seq>` | Same-instance resume: replay `sequence > after` from the registry, then tail live to the terminal | SSE; or `404` JSON if the turn is unknown, cross-workspace, or `replay_expired`                                                                                                              |

Known gap: the shipped widget still speaks the previous two-call flow until
`plan/03` lands — run the browser e2e suite only after it.

Routes live in `apps/partner-ai-service/src/inbound/http/routes/chat/`: start
in `runs/chat-runs.ts`, stream in `turns/chat-turns.ts`.

Supporting routes (all workspace-scoped, in `turns/chat-turns.ts` unless noted):

- `GET /chat/runs/:requestId` → recover a lost POST reply: `{ assistantTurnId, status }`.
- `GET /chat/turns/:assistantTurnId` → JSON status snapshot.
- `POST /chat/turns/:assistantTurnId/cancel` → `{ assistantTurnId, cancelRequested }`.
- `POST /chat/turns/:assistantTurnId/host-commands/:commandId/result` → the browser posts a host-command result back to the awaiting turn (see [host-commands.md](host-commands.md)).
- `GET /chat/activity` → a separate subject-scoped SSE stream of cross-conversation turn lifecycle (the "generating" dot). Snapshot plus live transitions, no replay, no terminal. `routes/chat/activity/activity.ts`.

## Lifecycle stages

Stages 1-9 are **pre-start**: they run synchronously inside `POST /chat/runs`
and any failure rejects setup as JSON. Stage 1 is the HTTP route; stages 2-9
run in `prepareStreamChatTurn`
(`packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts`).
Stages 10-13 are **post-start**: they run on the forked fiber in
`runTurnGeneration` (`.../stream-chat/protocol/run-turn-generation.ts`).

|   # | Stage                                          | Proves / records / finalizes                                                           | Failure                                   |
| --: | ---------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
|   1 | Validate request                               | Method, auth, JSON, parsed `ChatStreamRequest`                                         | JSON `400`                                |
|   2 | Prove workspace authority                      | Subject may act in this workspace                                                      | Pre-start reject                          |
|   3 | Record request received                        | Correlation + observation before any runtime work                                      | Pre-start reject                          |
|   4 | Resolve the turn plan                          | Profile, validated model/reasoning, tools, executor, instructions, capability manifest | Pre-start reject                          |
|   5 | Run turn guards                                | Profile-selected guards before private context, persistence, or tools                  | Pre-start reject                          |
|   6 | Ensure authorized conversation                 | Load or create only a conversation this subject may access                             | Pre-start reject                          |
|   7 | Append the user message                        | Store the user-visible message that starts the turn                                    | Pre-start reject                          |
|   8 | Start the turn record                          | Durable turn, status `running`; idempotent on `(workspace_id, request_id)`             | Pre-start reject **and** mark turn failed |
|   9 | Prepare and record context                     | History, host context, tool context, context manifest snapshot                         | Pre-start reject and mark turn failed     |
|  10 | Acquire lease, emit `sidechat.started` (seq 0) | Owner claims the lease, then the started event opens the stream                        | In-stream terminal                        |
|  11 | Execute the runtime                            | Run the executor; an `AbortController` lets a fiber interrupt abort the provider call  | In-stream terminal                        |
|  12 | Map events, append to the registry             | `RuntimeEvent` → `sidechat.v1`; each emitted event lands in the per-instance registry  | In-stream terminal                        |
|  13 | Finalize (always, via `onExit`)                | Write durable terminal status + assistant message; run post-success title generation   | See finalization                          |

The boundary sits after stage 9: `POST /chat/runs` forks post-start into a
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
- **Abnormal exit.** No terminal reached the registry, so finalization appends
  exactly one synthetic terminal at `maxSequence + 1`, then writes the failure
  status (`finalize-turn-generation.ts:60`).

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
| Pre-start (1-9)   | No            | Reject setup as a JSON error to the caller                      |
| In-stream (10-13) | Yes           | Append exactly one terminal to the registry; no caller response |

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

| Mechanism            | What it does                                                                                                                                                | Where                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Replay + tail        | A subscriber registers with the dispatcher first, replays `sequence > after` from the registry, then tails live behind an exactly-once gate to the terminal | `inbound/turn-stream/turn-subscription-stream.ts` |
| Per-subscriber queue | Each subscriber gets a bounded dropping queue; a low-frequency safety poll re-reads the registry as the missed-signal backstop                              | `in-memory-turn-event-log.ts`                     |
| Sweep                | Terminal, unwatched turns are dropped from the registry lazily when the next turn starts on that instance                                                   | `in-memory-turn-event-log.ts`                     |

Consequences of connection-bound transport:

- **Same-instance resume works.** An in-session reconnect with
  `after=<lastSeenSequence>` replays the suffix from the registry and tails on.
- **Cross-instance and cross-restart resume do not exist.** The registry dies
  with the process. A client that loses its stream waits for the turn to end
  and reads the result from conversation history.
- **Known gap:** the live stream now rides the POST connection (owner-bound by
  construction), but a resume `GET` for a _running_ turn on an instance that
  does not own it still opens an SSE that never produces data instead of
  failing fast — `plan/04` adds the owner check. Until it lands, run one
  service instance.

## Replay expiry

A swept turn can no longer replay, so the stream route fails closed _before_
opening SSE for **terminal** turns: it returns the `replay_expired` JSON error
with HTTP `404` (`turns/chat-turns-resumability.ts`, `chat-turns.ts`). The
widget maps `replay_expired` to a history fallback — it refetches the
conversation and clears the run. A **running** turn never returns
`replay_expired`.

## Durability and crash recovery

What Postgres durably holds: conversations, user and assistant messages, the
turn record and status, usage, context snapshots, audit events, and cancel
intent. What it does not hold: the in-flight event stream.

Generation acquires an owner lease and renews it on a heartbeat
(`protocol/lease/turn-lease-heartbeat.ts`); a renew that matches no row means
the owner was fenced, and the drain self-interrupts. Clean shutdown interrupts
generation first — each `onExit` finalizes — then tears down dispatchers
(SIGTERM/SIGINT in `server.ts`).

**Known gap:** nothing currently sweeps expired leases, so a hard crash (not a
clean shutdown) strands its running turns — status stays `running`, the
activity dot never clears, and the `requestId` cannot be retried. The sweep
that terminalizes orphaned turns is `plan/05`; the DB primitive
(`reapExpiredTurns`) already exists and is tested. The full crash-recovery
design — breadcrumbs, sweep, epoch fencing, client convergence — is
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
  `completed`/`error`/`blocked` is appended by the drain; only an abnormal exit
  appends the synthetic terminal.
- **`replay_expired` is `404`, terminal-only.** A running turn never expires.
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
