# Capacity And Deployment

Read this when: you are sizing, scaling, or operating Side Chat instances — or deciding what data grows and what disappears.
Source of truth for: the multi-instance model, SSE connection budgets, and the retention reality of every table.
Not source of truth for: the streaming decision itself ([ADR 0007](../adr/0007-connection-bound-streaming.md)), crash recovery mechanics ([ADR 0008](../adr/0008-crash-recovery-lease-sweep.md)), config knobs ([configuration.md](configuration.md)), or database tooling ([database.md](database.md)).

## The instance model

Instances are **turn-independent** (ADR 0007): any instance can serve the next
turn because all context is read from the database. Only the _live stream_ is
instance-bound, and that binding is physical — the connection that starts the
turn (`POST /chat/runs`) is served by the instance that runs it. No sticky
routing, no shared event bus, no instance discovery.

What crosses instances rides three small Postgres `LISTEN/NOTIFY` channels —
`turn_cancel`, `turn_activity`, and `host_command_result` — each a poke with
ids, never event bodies, and each backed by durable state plus a poll so a
lost signal costs latency, never correctness. Each instance holds **three
dedicated LISTEN connections** outside the query pool; budget them when
sizing Postgres `max_connections` alongside the per-instance query pool.

A request that lands on the wrong instance fails fast, and the widget handles
it: a resume for a running turn owned elsewhere is `409 stream_unavailable`
(the widget polls status until terminal); a finished turn whose buffer is gone
is `404 replay_expired` (the widget reads history). Rolling restarts are
therefore safe: in-flight turns on the retiring instance either finalize on
graceful shutdown or are terminalized by any survivor's reaper sweep.

## SSE connection budgets

Each open widget holds up to two long-lived SSE connections per instance: the
live turn stream (only while a turn runs) and the `/chat/activity` lifecycle
stream (whenever the panel is open). Size Node's open-socket expectations from
concurrent open panels, not from user counts. The stream itself is cheap: the
250 ms delta coalescer caps events at ~4/s per turn, and the streaming hot path
does zero database writes.

Both streams write an SSE comment heartbeat (`: hb`) every
`SIDECHAT_SSE_HEARTBEAT_MS` (default 20 s), so an idle stream keeps bytes flowing
under a proxy or load-balancer idle timeout. Keep that idle timeout above the
heartbeat interval — the default clears the common ALB 60 s — rather than above
the longest silent pause. The heartbeat is a comment the protocol decoder drops,
so it never appears as an event.

## What grows forever (by design)

Nothing is ever cleaned. There is deliberately no retention machinery — the
review decision was to document the growth, not to build cleanup nobody has
needed yet:

| Table                    | Grows by                                    |
| ------------------------ | ------------------------------------------- |
| `assistant_turns`        | 1 row per turn                              |
| `messages`               | 2 rows per turn (user + assistant)          |
| `usage_records`          | 1 row per runtime step (≥1 per turn)        |
| `turn_context_snapshots` | 1 row per turn                              |
| `audit_events`           | 1 row per audited action                    |
| `host_command_results`   | 1 row per host command a model call emitted |

Rough scale: at 10,000 turns/day that is ~3.6 M turn rows (and ~7.3 M message
rows) per year — comfortably ordinary Postgres volume, but plan storage and
index growth accordingly. If a deployment ever needs retention, it is a policy
decision for the adopter, not a framework default.

**The hot reads stay bounded as these tables grow.** The queries that run per
request or per connection do not scan the whole history:

- The activity snapshot, the per-turn concurrency guard, the resume lookup, and
  the reaper/cancel sweeps all read only _running_ turns, served by a **partial
  index** (`assistant_turns_running_lookup_idx … WHERE status = 'running'`) whose
  size tracks live concurrency, not the row count.
- History and the append `max(sequence_index)` ride the `(conversation_id,
sequence_index)` unique index (scanned backwards for `DESC`); there is no
  second same-columns index adding write cost.
- `readUsageSummary` sums within a workspace on `usage_records_workspace_idx`
  instead of full-scanning the table.
- The sidebar conversation list reads a subject's newest conversations through
  `conversations_workspace_subject_recent_idx` as a top-N scan, not a sort of the
  subject's whole (unbounded) set.

## Retention: what an adopter must build

No automatic pruning ships. When a deployment decides to cap growth, two
standard approaches fit:

- **Time partitioning** — range-partition the append-only tables (`assistant_turns`,
  `messages`, `usage_records`, `audit_events`, `turn_context_snapshots`,
  `host_command_results`) by month on their timestamp and drop old partitions.
  Detaching a partition is instant and index-free, unlike a bulk `DELETE`.
- **Scheduled delete** — a periodic job deleting rows past a cutoff. Every foreign
  key is `ON DELETE no action`, so a delete must remove children before parents:
  `usage_records` / `turn_context_snapshots` / `tool_invocations` /
  `host_command_results` → `assistant_turns` → `messages` → `conversations`.
  Batch by id range and `VACUUM` so a large purge does not bloat the tables.

One scaling threshold to watch: `readUsageSummary` aggregates a workspace's
`usage_records` live. The workspace index keeps that bounded to the workspace's
rows, but past ~10^7 rows the per-call `SUM` gets slow — introduce a rollup
(a materialized per-workspace running total updated on write) at that point
rather than widening the index.

## What deliberately disappears

The in-flight event stream — deltas, reasoning rows, tool inputs and results,
host-command activity detail — lives only in the per-instance in-memory
registry and dies with the turn (or the process). After a reload, history shows
the final user and assistant messages, not the tool cards. `tool_invocations`
is the reserved-but-unwritten table if the product ever wants persistent tool
detail in history; wiring it is an owner decision, not scheduled work.

## Verify

```sh
npm run verify
```
