# Assistant Turn

Read this when: you need the order, durability, or failure rules of one assistant turn.
Source of truth for: the resumable two-call turn lifecycle, the pre-start/in-stream failure split, finalization, lease/heartbeat, reaper, pruner, and reconnect-resume.
Not source of truth for: the `sidechat.v1` event vocabulary and SSE transport ([runtime-and-protocol-events.md](runtime-and-protocol-events.md)), package roles ([system-map.md](system-map.md)), or import boundaries ([package-boundaries.md](package-boundaries.md)).

## The one-paragraph model

A turn is **server-owned**: the browser starts it, then subscribes to it, but never generates it. Two HTTP calls do the work. `POST /chat/runs` runs all setup synchronously and returns a small JSON identity, then forks generation onto a background fiber. `GET /chat/turns/:assistantTurnId/stream` opens an SSE stream that replays the durable event log and tails it live. The `turn_events` log is the source of truth, so a dropped connection resumes the same turn from where it left off.

For shared terms (turn, durable log, terminal event), see [../domain/vocabulary.md](../domain/vocabulary.md).

## The two HTTP calls

| Call | Body / query | Runs | Returns |
| --- | --- | --- | --- |
| `POST /chat/runs` | `sidechat.v1` `ChatStreamRequest` | Pre-start synchronously, then forks generation | JSON `{ protocolVersion, requestId, assistantTurnId, conversationId, status: "running" }` (never SSE) |
| `GET /chat/turns/:assistantTurnId/stream?after=<seq>` | `after` = last seen sequence, default `-1` | Replay `sequence > after`, then tail live to the terminal | SSE; or `404` JSON if the turn is unknown, cross-workspace, or `replay_expired` |

Routes live in `apps/partner-ai-service/src/inbound/http/routes/chat/`: start at `runs/chat-runs.ts:40`, stream at `turns/chat-turns.ts:78`. The runner returns the identity shape from `apps/partner-ai-service/src/inbound/turn-runner/turn-runner.ts:160`.

Supporting routes (all workspace-scoped, all in `turns/chat-turns.ts` unless noted):

- `GET /chat/runs/:requestId` -> recover a lost POST reply: `{ assistantTurnId, status }`.
- `GET /chat/turns/:assistantTurnId` -> JSON status snapshot.
- `POST /chat/turns/:assistantTurnId/cancel` -> `{ assistantTurnId, cancelRequested }`.
- `GET /chat/activity` -> a separate subject-scoped SSE stream of cross-conversation turn lifecycle (the "generating" dot). Snapshot plus live transitions, no replay, no terminal. `apps/partner-ai-service/src/inbound/http/routes/chat/activity/activity.ts:29`.

## Lifecycle stages

Stages 1-9 are **pre-start**: they run synchronously inside `POST /chat/runs` and any failure rejects setup as JSON. Stage 1 is the HTTP route; stages 2-9 run in `prepareStreamChatTurn` (`packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts:29`). Stages 10-13 are **post-start**: they run on the forked fiber in `runTurnGeneration` (`.../stream-chat/protocol/run-turn-generation.ts:42`).

| # | Stage | Proves / records / finalizes | Failure |
| --: | --- | --- | --- |
| 1 | Validate request | Method, auth, JSON, parsed `ChatStreamRequest` | JSON `400` |
| 2 | Prove workspace authority | Subject may act in this workspace | Pre-start reject |
| 3 | Record request received | Correlation + observation before any runtime work | Pre-start reject |
| 4 | Resolve the turn plan | Profile, validated model/reasoning, tools, executor, instructions, approval policy, capability manifest | Pre-start reject |
| 5 | Run turn guards | Profile-selected guards before private context, persistence, or tools | Pre-start reject |
| 6 | Ensure authorized conversation | Load or create only a conversation this subject may access | Pre-start reject |
| 7 | Append the user message | Store the user-visible message that starts the turn | Pre-start reject |
| 8 | Start the turn record | Durable turn, status `running`; idempotent on `(workspace_id, request_id)` | Pre-start reject **and** mark turn failed |
| 9 | Prepare and record context | History, host context, tool context, context manifest snapshot | Pre-start reject and mark turn failed |
| 10 | Acquire lease, emit `sidechat.started` (seq 0) | Owner claims the lease, then the started event opens the stream | In-stream terminal |
| 11 | Execute the runtime | Run the executor; an `AbortController` lets a fiber interrupt abort the provider call | In-stream terminal |
| 12 | Map events, drain to the log | `RuntimeEvent` -> `sidechat.v1`; append each emitted event to `turn_events` | In-stream terminal |
| 13 | Finalize (always, via `onExit`) | Write durable terminal status; run post-success title generation | See finalization |

The boundary sits after stage 9: `POST /chat/runs` returns the identity JSON, then forks post-start into a `FiberMap` keyed by `assistantTurnId` — but only when the turn record was newly inserted (`turn-runner.ts:93`).

## Finalization owns the terminal

`runTurnGeneration` wraps the drain in `Effect.onExit`, so finalization runs on every exit path: success, provider error, cancel, shutdown, and lease-fence (`run-turn-generation.ts:52`). Terminal ownership splits by exit kind:

- **Normal terminal.** The stream emits `sidechat.completed`, `sidechat.error`, or `sidechat.blocked`; the drain appends it. `finalizeTurnGeneration` then only writes the durable turn status. `finalization/finalize-turn-generation.ts`.
- **Abnormal exit.** No terminal reached the log, so finalization appends exactly one synthetic terminal at `maxSequence + 1`, then writes the failure status. `finalize-turn-generation.ts:60`.

`finalize-turn-generation.ts:116` classifies the abnormal terminal honestly from the exit cause plus durable cancel intent:

| Exit cause | Cancel intent? | Status / code |
| --- | --- | --- |
| Interrupt | Yes (`cancel_requested_at`) | `user_aborted` / `aborted` |
| Interrupt | No (shutdown or lease-fence) | `provider_failed` / `timeout` |
| Defect or append failure | n/a | `provider_failed` / `provider_failed` |

`sidechat.blocked` is a terminal safety-stop, not an error. Title generation is post-success enrichment, isolated; its failure is observed, never a second terminal (`finalization/protocol-terminal-lifecycle.ts:140`).

## Failure split

The split turns on one question: has the browser seen `sidechat.started`?

| Phase | Started seen? | Behavior |
| --- | --- | --- |
| Pre-start (1-9) | No | Reject setup as a JSON error to the caller |
| In-stream (10-13) | Yes | Append exactly one terminal `sidechat.error` to the log; no caller response |

`POST /chat/runs` maps pre-start failures at `chat-runs.ts:88`: `PartnerAiCoreError` -> its protocol code and HTTP status; `ProtocolValidationError` -> `400`; anything else -> `500`. A failure at or after stage 8 marks the started turn failed *and* still rejects setup, so durable state exists without half-opening a stream.

In-stream, a provider failure after `sidechat.started` is caught and emitted as the terminal `sidechat.error`; the protocol state machine drops any event after a terminal (`protocol/protocol-stream-state-machine.ts:57`). Abnormal fiber exits route through the synthetic-terminal path above.

## Durability and recovery

`turn_events` is the source of truth. Append runs `INSERT ... ON CONFLICT (assistant_turn_id, sequence) DO NOTHING` plus `pg_notify` in one transaction, so the signal fires only on commit (`packages/db/src/repositories/postgres-drizzle/records/turn-events.ts`). The browser is a subscriber, never the generator, so any reconnect with `after=<lastSeenSequence>` resumes the same turn.

| Mechanism | What it does | Where |
| --- | --- | --- |
| Replay + tail | Subscriber registers with the dispatcher first, replays `sequence > after`, then tails live behind one exactly-once gate to the terminal | `turn-stream/turn-subscription-stream.ts` |
| Owner lease | All lease state CAS on `assistant_turns` (`owner_instance_id`, `lease_epoch`, `lease_expires_at`) | `db/.../records/turn-lease.ts` |
| Heartbeat | Renews the lease every `heartbeatInterval`, epoch-scoped; a renew matching 0 rows means fenced, so it self-interrupts the drain | `protocol/lease/turn-lease-heartbeat.ts:76` |
| Reaper | Per-instance sweep that CAS-terminalizes running turns whose lease expired, bumps `lease_epoch` to fence the owner, and appends one synthetic terminal | `turn-runner/maintenance/turn-reaper.ts:99` |
| Pruner | Per-instance sweep that deletes `turn_events` rows of terminal turns older than `turnEventRetention`; keeps the turn record and message | `turn-runner/maintenance/turn-pruner.ts:74` |

The reaper picks rows with `FOR UPDATE SKIP LOCKED` so concurrent sweeps stay disjoint, and writes `user_aborted`/`aborted` when a cancel was requested, else `provider_failed`/`timeout` (`turn-lease.ts:111`).

**Crash recovery.** No durable worker exists: an instance crash strands `running` turns until the reaper terminalizes them. The log keeps every delta up to the crash, so clients reconnect with `after=lastSeenSequence` and lose nothing committed. Clean shutdown interrupts generation first (each `onExit` finalizes), then tears down the reaper, pruner, and dispatchers; the Node server runs it on SIGTERM/SIGINT.

## Replay expiry

A pruned turn can no longer replay, so the stream route fails closed *before* opening SSE. `isReplayExpired` returns true only for a **terminal** turn whose smallest retained sequence is past `after + 1`, or whose log is gone (`turns/chat-turns-resumability.ts:35`). The route then returns the `replay_expired` JSON error with HTTP `404` (`chat-turns.ts:91`).

- A **running** turn never returns `replay_expired` — its tail still delivers events.
- On `replay_expired`, the widget falls back to `GET /chat/conversations/:id` for history and clears the run.

## Cancel

`POST /chat/turns/:assistantTurnId/cancel` is durable intent plus interruption (`chat-turns.ts:109`). `requestTurnCancellation` CAS-sets `cancel_requested_at` and `pg_notify`s a cancel channel in one transaction, so cancelling a finished, unknown, or cross-workspace turn is a no-op ack. The route also interrupts the local fiber directly; a cancel dispatcher interrupts the owning fiber on a remote instance. With no live owner, only the durable intent remains and the reaper terminalizes it later.

## Idempotency

Idempotency is `requestId`-only. A repeated `(workspace_id, request_id)` resolves to the existing turn record and does **not** fork a second generation, gated by `turn.assistantTurn.inserted` (`turn-runner.ts:93`). No `request_fingerprint` column and no `409`-on-mismatch path exists; the draft-plan fingerprint was not adopted.

## Newcomer traps

- **Two calls, one stream path.** Start with `POST /chat/runs` (JSON); the only stream is `GET /chat/turns/:id/stream`. The old response-owned `POST /chat/stream` is gone.
- **Finalization is the runner's `onExit`, not a stream stage.** Durable terminal persistence lives in `run-turn-generation.ts`. Do not re-add a `finalized` stream segment.
- **Normal vs abnormal terminal differ.** The stream's `completed`/`error`/`blocked` is appended by the drain; `onExit` only writes status. Only an abnormal exit appends the synthetic terminal.
- **`replay_expired` is `404`, terminal-only.** A non-terminal turn always has its log.
- **Generation is socket-independent.** Cancelling the SSE releases the local subscriber only; it never interrupts the fiber.

## Files to open

- `packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts`
- `packages/partner-ai-core/src/application/stream-chat/turn/turn-policy-plan.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/run-turn-generation.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-stream-state-machine.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/lease/turn-lease-heartbeat.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/finalization/finalize-turn-generation.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/finalization/protocol-terminal-lifecycle.ts`
- `apps/partner-ai-service/src/inbound/turn-runner/turn-runner.ts`
- `apps/partner-ai-service/src/inbound/turn-runner/maintenance/turn-reaper.ts`
- `apps/partner-ai-service/src/inbound/turn-runner/maintenance/turn-pruner.ts`
- `apps/partner-ai-service/src/inbound/turn-stream/turn-subscription-stream.ts`
- `apps/partner-ai-service/src/inbound/http/routes/chat/runs/chat-runs.ts`
- `apps/partner-ai-service/src/inbound/http/routes/chat/turns/chat-turns.ts`
- `apps/partner-ai-service/src/inbound/http/routes/chat/turns/chat-turns-resumability.ts`
- `packages/db/src/repositories/postgres-drizzle/records/turn-events.ts`
- `packages/db/src/repositories/postgres-drizzle/records/turn-lease.ts`
