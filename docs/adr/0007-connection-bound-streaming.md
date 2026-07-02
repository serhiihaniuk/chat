# ADR 0007: Connection-Bound Streaming

Status: accepted 2026-07-01, expanded 2026-07-02 (supersedes the durable-log design — see Context)

## Context

Streaming has been redesigned twice. The first shape was response-owned: one
POST both ran the turn and carried its SSE, so a reload or dropped connection
orphaned the answer. The second shape made turns durable: a `turn_events`
Postgres log as source of truth, LISTEN/NOTIFY fan-out, a lease reaper, and a
retention pruner, so any instance could replay any turn. It was built,
verified — and removed on 2026-06-30 (commits `b194451` → `349ba73`): the write
amplification (rows + NOTIFY per delta), the recovery machinery, and the
operational surface were judged too heavy for the product need.

The product need is what claude.ai does: the active tab streams live; a reload
or another tab shows the final message once the turn completes.

## What it buys here

| Capability                                    | In this repo                                                                                                                                 | With the durable log (measured, then removed)                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Zero DB writes on the streaming hot path.** | Deltas live in a per-instance registry; the 250 ms coalescer caps events at ~4/s per turn; Postgres sees ~15 short queries per whole turn.   | A row + a NOTIFY per delta event, per turn, forever — write amplification for a replay feature the product doesn't need. |
| **A small operational surface.**              | No event-log table, no retention pruner, no event fan-out channel to operate; the registry dies with the process by design.                  | Retention policy, pruning schedules, and log-growth capacity planning as day-one operator duties.                        |
| **The claude.ai UX, exactly.**                | Active connection streams live; reload/other tabs read the finished message from history; multi-instance serves the _next_ turn from the DB. | Cross-instance mid-turn replay — engineering nobody's UX required.                                                       |
| **The guarantees that matter survive.**       | Idempotent starts (a real unique constraint), genuine provider abort on cancel, exactly-one-terminal finalization, durable final state.      | Same — these never depended on the log.                                                                                  |

## Decision

Assistant turns are **server-owned and connection-bound**:

- Generation runs on a server-owned fiber, independent of any socket. In-flight
  events live in a per-instance, in-memory registry — the only live transport.
- Postgres remains the source of truth for **final** state: conversations,
  messages, turn records and statuses, usage, cancel intent.
- The stream is delivered on the connection that starts the turn:
  `POST /chat/runs` returns the SSE stream directly, with `sidechat.started`
  at sequence 0 carrying the turn identity (landed via `plan/02`). A
  same-instance resume endpoint replays the registry; a non-owner instance
  must fail fast, never hang.
- Multi-instance works **turn-independently**: any instance serves the next
  turn because context comes from the DB. Sticky routing is not required and
  not wanted.
- Cross-instance cancel and the activity ("generating" dot) stream keep their
  small Postgres LISTEN/NOTIFY channels — pokes with ids, never event bodies.
- Crash recovery is a lease-based orphan sweep that terminalizes `running`
  turns whose owner died, so a crash can never poison the next turn.

## Objections answered

**"We're giving up resumability."** Be precise about what is lost: mid-turn
replay across instances or restarts. What is kept: same-instance reconnect
replays the registry; a lost stream converges via a status poll that works on
_any_ instance, then reads the finished answer from history. The user-visible
behavior matches claude.ai — brief "reconnecting", then the completed message.

**"How does this scale horizontally?"** Turn-independently: the next turn can
start on any instance because all context is read from the DB. Only the _live
stream_ is instance-bound, and stream-from-POST makes that binding physical
(the connection that starts the turn is the owner) instead of an LB
configuration. No sticky routing, no shared event bus.

**"What about crashes?"** In-process guarantees end at graceful shutdown, so
crash recovery is durable-state + sweep: the crashed owner's lease expires,
any surviving instance terminalizes its turns (epoch fencing handles a zombie
owner waking up), and clients converge via the poll. The partial answer is
lost — the accepted trade; the user re-asks. The full design is
[ADR 0008](0008-crash-recovery-lease-sweep.md).

## Consequences

Accepted losses: no cross-instance or cross-restart replay of an in-flight
stream; a client that loses its connection waits for the turn to finish and
reads the result from history.

The code is catching up to this decision; gaps and fixes are tracked in
[`plan/`](../../plan/00-overview.md). Landed: stream-from-POST end to end —
the server (`plan/02`), the widget's single-call client (`plan/03`), fail-fast
non-owner streaming (`plan/04`: a running turn owned elsewhere is
`409 stream_unavailable`, never a hanging SSE; only the owner registers turns),
and the orphan sweep (`plan/05`, ADR 0008). Pending: client-side handoff/retry
(`plan/06`, `plan/07`).
