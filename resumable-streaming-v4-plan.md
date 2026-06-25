# Draft Plan: Resumable Server-Owned Chat Streams

Status: draft (rev 2 — incorporates architect `WATCH` + critic `REJECT` review)
Date: 2026-06-21
Scope: Side Chat service, persistence, protocol transport, and widget stream state

> **Amendment (2026-06-24, post-implementation).** This plan is implemented and is
> now superseded by ADR 0009 and `docs/architecture/assistant-turn.md`. One
> deviation was adopted deliberately: turn idempotency is **`requestId`-only**. The
> `request_fingerprint` column and the "compare `request_fingerprint` → `409` on
> mismatch" conflict path described below were **not adopted** — a repeated
> `(workspace_id, request_id)` simply returns the existing turn — and the unused
> column has been dropped. See `resumable-streaming-quality-review.md` (finding C1).

## Deployment Model (decided — load-bearing)

Long-running Node process, **horizontally scalable to multiple instances behind a
load balancer**, **no edge/serverless**. Consequences:

- In-process Effect fibers are a valid place to run generation; no durable worker
  needed for normal operation.
- A reconnect/cancel can land on a **different instance** than the one generating;
  **no sticky routing assumed**. So the authoritative log and the cross-instance
  wake signal live in **Postgres** (`turn_events` + `LISTEN/NOTIFY`). No Redis.

## Review Resolutions

Architect status was `WATCH`, critic status `REJECT`. Each blocking point and its
resolution in this revision:

| #   | Review point                                                                                                                           | Resolution (section)                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Run identity: `turn_events` keyed by `assistant_turn_id`, but client may know only `requestId`; `runTurn` appends before the id exists | **Create the turn synchronously in `POST /chat/runs`**; it returns `assistantTurnId`. Canonical key = `assistantTurnId`; `requestId` is idempotency + resolver only → _Identity & Lifecycle Split_ |
| B   | Cancel before `sidechat.started` (only turn-id cancel route)                                                                           | POST returns `assistantTurnId` synchronously; `GET /chat/runs/:requestId` resolves it if the POST reply was lost → _HTTP API_, _Cancel_                                                            |
| C   | Replay offset contradiction (`from` vs `after`/`> after` vs `lastSeq+1`)                                                               | One convention: **`after=<lastSeenSequence>`, default `-1`, `sequence > after`** → _Replay Offset Contract_                                                                                        |
| D   | Cancel fiber semantics: `Effect.race` makes cancel look like success                                                                   | Cancel via **external interruption** (`FiberMap.remove`); `onExit` sees `Interrupt` → `user_aborted` → _Cancel_                                                                                    |
| E   | Terminal event ownership after deleting stream-tail finalize; duplicate terminals                                                      | Normal terminal via stream `runForEach`; abnormal via `onExit`/reaper at `max(seq)+1`; **partial unique index** on terminal types → _Terminal Event Ownership_                                     |
| F   | Append idempotency hides corruption                                                                                                    | On PK conflict compare `(type,payload)`: equal → no-op, different → fail + terminalize → _Idempotency & Conflict_                                                                                  |
| G   | Lease fencing for dead-owner recovery                                                                                                  | `owner_instance_id` + `lease_expires_at` + `lease_epoch`; heartbeat/reaper compare-and-set → _Lease Fencing_                                                                                       |
| H   | Keep `TurnEventSignals` out of core                                                                                                    | `NOTIFY` folds into the db `appendEvent` adapter; LISTEN/dispatch is service-side; core keeps only `TurnEventLogPort` → _Boundaries_                                                               |
| I   | Tenant-unsafe `FiberMap<requestId>`                                                                                                    | Key `FiberMap` by `assistantTurnId` (server-generated, globally unique) → _Generation Runner_                                                                                                      |
| J   | Provider abort on interruption unproven                                                                                                | Gated prerequisite with a dedicated test → _Cancel_, _Risks_                                                                                                                                       |

## Prototype Final-State Rule

Pre-production: build the clean final architecture, delete the response-owned path
in the same change (per `AGENTS.md`). No compatibility wrappers for
`POST /chat/stream`, no parallel legacy/new paths, no temporary socket-owned
adapters, no stale docs/tests. Public `sidechat.v1` contracts change deliberately,
with tests.

## Problem

Generation is bound to the browser response: `POST /chat/stream` passes
`context.req.raw.signal` into `streamChatEffect`; `streamingSseResponse` drains one
iterator in the response body with no `cancel()` distinct from generation, so a
disconnect makes `enqueue` throw and the stream-tail finalize
(`Stream.fromEffectDrain(finalizeProtocolStream)`) never runs — the turn is left
`running`, never persisted. The widget keeps the turn in component state, so a
remount forgets it. Separately, the auth adapter defaults `issuedAt` to
`2026-05-23T13:00:00.000Z` and persistence uses it as the record clock.

## Invariant

> An assistant turn's lifecycle and durable record belong to **core**; its event
> log and terminal state live in **Postgres**; browser sockets are only
> subscribers, reachable from **any instance**.

A turn runs to a terminal event, explicit cancel, timeout, or shutdown regardless
of sockets/components/instances, and is always recoverable from the durable log.

## Effect v4 Notes (installed `4.0.0-beta.70`, declarations checked)

- Fork family: `forkChild`, `forkIn`, `forkScoped`, `forkDetach`. **No bare
  `Effect.fork`/`forkDaemon`.** We use a service-scoped `FiberMap`
  (`make`/`run`/`remove`) — `run` forks, `remove` interrupts — so shutdown is owned.
- Fiber value type is `Fiber.Fiber<A, E>` (no `RuntimeFiber`).
- `Effect.onExit`/`onInterrupt`/`ensuring` give consumer-independent finalization.
- `PubSub.bounded({ capacity, replay? })`, `Stream.fromPubSub`, `Stream.fromQueue`,
  `Stream.toReadableStream` exist. PubSub replay is an in-memory optimization only;
  **the replay contract is sequence-based replay from `turn_events`**.
- `LISTEN/NOTIFY` lives in the db driver under persistence; confirm the driver
  keeps a dedicated `LISTEN` connection (direct connection if PgBouncer is in
  transaction mode).
- **Style: generators, not pipe.** Sequencing is `Effect.gen` + `yield*`
  (matches the codebase and AGENTS.md "named stages"); consume streams via
  `yield* Stream.runForEach`/`runDrain` inside the generator. The only non-`gen`
  forms are interrupt-safe wrappers like `Effect.onExit` (data-first) and Stream
  transform pipelines where a generator has no equivalent — never `.pipe` chains
  for plain sequencing.

## Boundaries

- **core (`partner-ai-core`)**: assistant-turn lifecycle, protocol validity,
  runtime mapping, finalization. Adds **`TurnEventLogPort`** (`appendEvent`,
  `readEventsAfter`, `maxSequence`) — core consumes it in finalize/terminal append.
- **persistence (`db`)**: `turn_events` table + `assistant_turns` lease/cancel/
  fingerprint columns; `TurnEventLogPort` adapter where **`appendEvent` performs the
  insert and `pg_notify` in one transaction** (notify fires on commit).
- **service (`partner-ai-service`)**: HTTP routes, the per-instance generation
  `FiberMap`, the per-instance `LISTEN` listener + local subscriber dispatcher, SSE
  edge, reaper. Composes ports, owns the long-lived scope. `LISTEN/NOTIFY`
  mechanics stay here/db — **not a core port** (resolves H).

## Configuration

All config-driven values live in `apps/partner-ai-service/sidechat.config.ts` (the
human-readable `SideChatConfig`), declared via `readEnv` + catalog constants —
never hardcoded or read ad-hoc from `process.env` in feature code or tooling. This
already includes the **database connection** (`environment.databaseUrl` sourced
from `SIDECHAT_DATABASE_URL`); the db tooling reads that same env contract.

New resumability tunables are declared as a `resumability` section on
`SideChatConfig` (extend the type + the catalog), resolved by core/service through
the config — not literals:

- `leaseTtl` / `heartbeatInterval` — owner lease duration and refresh cadence.
- `reaperInterval` — how often expired-lease running turns are terminalized.
- `turnEventRetention` — how long `turn_events` rows are kept before pruning.
- `notifyChannel` — the Postgres `LISTEN/NOTIFY` channel name.
- `safetyPollInterval` — subscriber reconcile-poll cadence (missed-notify backstop).
- `instanceId` — owner instance identifier (env-sourced) written to `owner_instance_id`.

Steps 2–7 must declare every new tunable here; do not inline durations, intervals,
channel names, or limits.

## Schema

```sql
create table sidechat.turn_events (
  assistant_turn_id text not null
    references sidechat.assistant_turns(assistant_turn_id),
  sequence    integer not null,                     -- 0 = sidechat.started
  type        text not null,
  payload     jsonb not null,                        -- the SidechatStreamEvent
  created_at  timestamptz not null default now(),    -- server clock, per event
  primary key (assistant_turn_id, sequence)
);

-- exactly one terminal event per turn, across stream / onExit / reaper paths
create unique index turn_events_one_terminal
  on sidechat.turn_events (assistant_turn_id)
  where type in ('completed','error','blocked');

alter table sidechat.assistant_turns
  add column owner_instance_id   text,
  add column lease_expires_at    timestamptz,
  add column lease_epoch         integer not null default 0,
  add column cancel_requested_at timestamptz,
  add column request_fingerprint text;            -- hash(canonical request + scope)
```

`assistant_turns.status` (already defaults `running`) plus
`(conversation_id, started_at)` indexing already answer "is there an active turn?".

## Identity & Lifecycle Split (resolves A, B)

`POST /chat/runs` runs the existing **pre-start** pipeline synchronously
(`assistant-turn.md` steps 1–9: validate, auth, profile/guards, ensure
conversation, append user message, **start assistant turn record**, prepare
context). It returns `{ requestId, assistantTurnId, conversationId, status }` —
or a JSON pre-start error (recording a failed turn if it failed at/after step 8,
matching the documented failure split). Pre-start work uses existing core seams
(`prepareStreamChatTurn`).

- `assistantTurnId` (server-generated) is the **canonical key** for events, stream,
  status, cancel. It exists before any `turn_events` row, so `assistant_turn_id`
  appends are always valid (resolves A).
- `requestId` (client UUID, high-entropy) is the **idempotency key**
  (`assistant_turns (workspace_id, request_id)` unique) and a **resolver**:
  `GET /chat/runs/:requestId` → `{ assistantTurnId, status }`, for the rare case
  the POST reply was lost mid-flight (resolves B).
- The background fiber runs only **post-start** (steps 10–13): emit
  `sidechat.started`, stream runtime events, finalize.
- No aliasing, no request-id stream route — both removed.

## Replay Offset Contract (resolves C)

One convention everywhere:

- Query param **`after=<lastSeenSequence>`**, default **`-1`**.
- Server returns events with **`sequence > after`**, ordered.
- `sidechat.started` is `sequence = 0`, so `after=-1` returns the whole stream.
- Widget tracks `lastSeenSequence` (init `-1`) and reconnects with
  `?after=${lastSeenSequence}`. All `from`/`lastSeq+1` usages are deleted.

## Generation Runner (per instance; resolves I)

A service-scoped `FiberMap` **keyed by `assistantTurnId`** (globally unique →
tenant-safe). After pre-start succeeds, `POST /chat/runs` does
`FiberMap.run(fibers, assistantTurnId, runTurn)` — forks into the service scope, so
shutdown interrupts it and `onExit` then writes a terminal record.

```ts
// Generator style throughout. onExit is the one wrapper — data-first and
// interrupt-safe — so finalize runs on success, error, cancel-interrupt,
// shutdown, and defect alike.
const runTurn = (run: RunCtx) => Effect.onExit(executeTurn(run), (exit) => finalizeTurn(run, exit));

const executeTurn = (run: RunCtx) =>
  Effect.gen(function* () {
    // Claim ownership first (owner_instance_id + lease_epoch + lease_expires_at)
    // so the reaper cannot fence a turn that has a live owner.
    yield* acquireLease(run);

    // Drain post-start events (started + runtime; no request abort signal).
    // appendEvent does the turn_events insert and pg_notify in one transaction.
    yield* Stream.runForEach(streamPostStart(run), (event) =>
      eventLog.appendEvent({ turnId: run.turnId, event }),
    );
  });
```

- The fiber heartbeats the lease while running (see _Lease Fencing_).
- Finalize lives **only** in `onExit`; the stream-tail `finalized` segment in
  `createProtocolEventStream` is deleted.

## Terminal Event Ownership & Finalization (resolves E, F)

- **Normal terminal** (`completed` / provider `error`): emitted by the core
  protocol stream (the state machine already guarantees exactly one), appended by
  `runForEach` at the core-assigned sequence.
- **Abnormal terminal** (user cancel, interrupt, shutdown, dead-owner reaper): no
  terminal was emitted, so `finalizeTurn`/reaper appends a synthetic
  `sidechat.error(aborted|interrupted)` at `maxSequence + 1`, using
  `ON CONFLICT DO NOTHING` on the partial-unique-terminal index so it can never
  duplicate a real terminal.
- **Append idempotency:** PK `(assistant_turn_id, sequence)`. On conflict compare
  `(type, payload)`: equal → no-op; **different → fail loudly and terminalize**
  the run (corruption guard, resolves F).
- **Durable status** is idempotent via the existing `WHERE status='running'` guard
  in `completeAssistantTurn`/`failAssistantTurn` — first transition wins.
- Whoever appends a terminal also notifies (it goes through `appendEvent`), so
  subscribers end via `Stream.takeUntil(isTerminal)`.

Invariant: **exactly one terminal event** (partial unique index) **and exactly one
status transition** (running-guard) across every path.

## Live Subscription Transport (per instance)

`appendEvent` does INSERT + `pg_notify('turn_events', {turnId, sequence})` in one
transaction. Each instance holds one `LISTEN` connection; on notify it reads new
rows (per-turn high-water mark, read once) and fans out to local subscribers (a
per-instance dispatcher). A subscriber stream:

1. register with the dispatcher first (no missed notify),
2. `readEventsAfter(after)` from the log; track `maxEmitted`,
3. tail dispatched rows with `sequence > maxEmitted`,
4. `Stream.takeUntil(isTerminal)`.

A low-frequency per-subscriber safety poll covers a missed notify / listener
reconnect. The log is always truth; notify/poll only decide _when_ to read.
Bounded local fanout: a lagging subscriber is dropped and re-syncs from the log.

## Cancel (cross-instance; resolves D, J)

Cancel is **durable intent + interruption**, never an in-fiber race:

1. `POST /chat/turns/:assistantTurnId/cancel` (any instance) sets
   `cancel_requested_at` and `pg_notify`s a cancel channel.
2. The **owning instance**'s listener calls `FiberMap.remove(fibers, turnId)` →
   genuine **fiber interruption**.
3. `onExit` sees `Exit.failure(Cause.Interrupt)` → `failAssistantTurn(user_aborted)`
   - appends exactly one `sidechat.error(aborted)` (resolves D).
4. If the owner is dead (no fiber), `cancel_requested_at` persists and the reaper
   terminalizes as aborted — cancel is correct with or without a live fiber.

**Provider abort (J):** interruption must abort the in-flight provider call, or
cancel/shutdown stops the socket but not generation/billing. `agent-runtime` is
**in scope**: verify it threads an AbortController off Effect interruption; add a
test asserting cancel stops _provider work_, not just the stream.

## Lease Fencing (resolves G)

- Turn is created (in POST) with the owning instance's initial lease:
  `owner_instance_id`, `lease_epoch+1`, `lease_expires_at = now()+ttl`.
- **Heartbeat (compare-and-set):**
  `UPDATE ... SET lease_expires_at = now()+ttl WHERE assistant_turn_id=? AND owner_instance_id=? AND lease_epoch=?`.
  **0 rows ⇒ fenced** ⇒ the owner interrupts its own fiber.
- **Reaper (compare-and-set + fence):**
  `UPDATE ... SET status='provider_failed', lease_epoch=lease_epoch+1, completed_at=now() WHERE status='running' AND lease_expires_at < now() RETURNING ...`,
  then append the synthetic terminal (idempotent). Bumping `lease_epoch` fences a
  slow-but-alive owner, so no duplicate terminalization.

## Timestamp Fix

`authContext.issuedAt` is auth evidence, not the persistence clock. **Delete** the
hardcoded `?? "2026-05-23T13:00:00.000Z"` (`service-auth.ts`). Source record time
from `ports.clock.now()` (already used at `protocol-event-stream.ts:120`);
conversation/message ports receive `now`; each `turn_events` row stamps its own
`created_at`. Keep the clock an injectable port for deterministic tests.

## HTTP API

- `POST /chat/runs` — pre-start synchronously; returns
  `{ requestId, assistantTurnId, conversationId, status }` (JSON, no SSE).
- `GET  /chat/runs/:requestId` — resolve to `{ assistantTurnId, status }`.
- `GET  /chat/turns/:assistantTurnId` — JSON turn/run status.
- `GET  /chat/turns/:assistantTurnId/stream?after=<seq>` — replay + tail (SSE).
- `GET  /chat/conversations/:id` — messages + `activeTurn`.
- `POST /chat/turns/:assistantTurnId/cancel` — explicit cancel.

Delete `POST /chat/stream`. A stream endpoint that cannot replay (log pruned)
returns a JSON `replay_expired` error **before** opening SSE. Auth is re-proven on
every reconnect/cancel (same tenant/workspace/subject, ownership via repository
checks); ids are never bearer capabilities. **Request conflict:** on
`(workspace_id, request_id)` collision, compare `request_fingerprint` — equal →
return existing (idempotent), different → `409`.

### SSE Response

Build the response from the subscription stream via `Stream.toReadableStream`;
`cancel()` unsubscribes the local subscriber only and never touches the fiber;
terminal closes normally. Delete the hand-rolled `controller.enqueue` body.

## Client Design

Move live turn ownership out of `useWidgetChat` into a module store keyed by
`{ storageKey, baseUrl, requestId }`, tracking: requestId; assistantTurnId/
conversationId; local message ids; status (submitted | streaming | reconnecting |
completed | failed | cancelled); **`lastSeenSequence` (init `-1`)**; the messages/
activity projection; reconnect metadata. The hook subscribes and renders; it is
not the durable owner. Plain store — no React Query, no snapshot merge; apply an
ordered event log with dedupe by `eventId`/`sequence`.

Reconnect on mount / `visibilitychange` visible / `online` / selecting the active
conversation: read the active run + a lightweight localStorage marker; call
`GET /chat/turns/:assistantTurnId/stream?after=${lastSeenSequence}` (resolve via
`GET /chat/runs/:requestId` first if the id is unknown); apply idempotently; stop
on terminal; on `replay_expired` read `GET /chat/conversations/:id` and clear the
run. A reconnect may land on a different instance — expected and supported.

`stop()` calls the cancel endpoint (not just an abort); after ack, render the
terminal state from the stream/status.

## Protocol Notes

No `sidechat.v1` event-shape change — events already carry `eventId`,
`assistantTurnId`, `sequence`, `createdAt`, `conversationId` on `started`. Add only,
with tests: a JSON run-status DTO **outside** `sidechat.v1`, and a `replay_expired`
error code if existing protocol errors do not fit.

## Build Sequence

A build order, not a release sequence; each step ends in final shape and deletes
replaced code.

- **Step 0 — Time semantics.** Persistence ports accept `now`; write from
  `ports.clock.now()`; delete the hardcoded `issuedAt` default; regression test.
- **Step 1 — Schema + log port.** `turn_events`, partial-unique-terminal index,
  `assistant_turns` lease/cancel/fingerprint columns; `TurnEventLogPort` adapter
  with transactional append+`pg_notify`; payload-compare-on-conflict; tests.
- **Step 2 — Pre-start split + runner.** `POST /chat/runs` runs pre-start
  synchronously and returns `assistantTurnId`; service `FiberMap` (keyed by turn
  id) forks post-start; finalize via `onExit`; terminal-ownership rules; remove the
  request abort signal; delete the stream-tail `finalized`. Tests: socket-
  independent finalization, exactly-one-terminal, request-fingerprint conflict.
- **Step 3 — Transport + HTTP.** Per-instance `LISTEN` listener + dispatcher +
  safety poll; stream/status/resolve/conversations routes with the `after`
  contract; `Stream.toReadableStream` SSE; delete `POST /chat/stream` and the old
  `sse.ts` body. Test **generate on A, subscribe on B**.
- **Step 4 — Cancel.** Cancel intent + notify; owning-instance `FiberMap.remove`
  interrupt; `onExit` → `user_aborted` + one `sidechat.error(aborted)`; **verify
  provider abort**. Test cancel during starting/running/terminal/unauthorized and
  **cancel on B while running on A**.
- **Step 5 — Lease + reaper.** Lease acquire/heartbeat compare-and-set; reaper
  compare-and-set + epoch fence + synthetic terminal; clean shutdown. Dead-owner
  and fenced-owner tests.
- **Step 6 — Client store + reconnect.** Module run store; `lastSeenSequence`;
  reconnect triggers; `stop()` → cancel. Reducer/hook tests + harness remount E2E.
- **Step 7 — Hardening.** `turn_events` retention/pruning (pruned → history
  fallback); observability (subscriber count, replay hits/misses, replay_expired,
  run duration, cancel reason, lease reaps).

## Verification

Server: log repo + payload-conflict tests; finalization independent of socket;
exactly-one-terminal across success/error/cancel/shutdown/reaper; replay from `-1`,
`lastSeen`, and expired; cross-instance generate/subscribe and cross-instance
cancel + provider-stop; heartbeat fencing and dead-owner reaper; request-
fingerprint conflict; pre-start JSON errors preserved; timestamp regression.

Widget: idempotent application by sequence/eventId; remount/reconnect; visibility/
online; `stop()` calls cancel; harness E2E — submit, immediately remount / switch
pane, reconnect, finish with assistant content.

```sh
npm test --workspace @side-chat/partner-ai-service
npm test --workspace @side-chat/side-chat-widget
npm run lint:custom
npm run typecheck
npm run verify
```

## Risks And Open Questions

- **Provider abort on interruption** — if `agent-runtime` ignores interruption,
  cancel/shutdown stops the socket but not generation/billing. Gate Step 4 on it.
- **Missed `NOTIFY`** — covered by the safety reconcile poll; the log is truth.
- **`LISTEN` connection** — one dedicated connection per instance; direct
  connection if PgBouncer is transaction-mode.
- **`turn_events` growth** — retention/pruning (Step 7); pruned runs fall back to
  conversation history on resume.
- **Restart loses in-flight provider work** — accepted (no durable worker; matches
  deployment model). The reaper terminalizes; the log preserves deltas up to the
  crash.

## File Areas Expected To Change

Persistence (`db`): `turn_events` + index; `assistant_turns` columns + migration;
`TurnEventLogPort` adapter with transactional append+notify.

Core (`partner-ai-core`): `TurnEventLogPort` definition; expose pre-start
(`prepareStreamChatTurn`) and post-start stream as separate entry points; move
finalize to `onExit`; delete the `finalized` stream segment; `now` plumbing.

Service (`partner-ai-service`): generation `FiberMap` runner; per-instance listener

- dispatcher; new routes; rebuilt `sse.ts`; reaper; delete `POST /chat/stream`;
  `app.ts` wiring; persistence `now`; tests.

Protocol (`chat-protocol`): no event-shape change; run-status DTO / `replay_expired`
only if needed, with tests.

Widget (`side-chat-widget`): module run store; rebuilt `use-widget-chat.ts`; client
methods for create/resolve/subscribe/status/cancel; reconnect hook; tests +
harness remount test.

Runtime (`agent-runtime`): confirm/implement provider abort on Effect interruption.
