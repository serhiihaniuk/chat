# ADR 0009: Host-Command Await And Result Relay

Status: accepted 2026-07-02 (relay implementation tracked in `plan/08`)

## Context

A host command is a tool the **browser** executes (open a record, focus a
panel), but the **model** calls it mid-turn and needs the result to keep
generating. Two physical constraints shape the design:

- SSE is one-directional. The turn stream can deliver the command *to* the
  browser, but it cannot carry the result back up. The return path must be a
  separate HTTP request.
- With connection-bound streaming (ADR 0007), the paused tool loop lives in the
  memory of the one instance running the turn's fiber. Behind a load balancer,
  the browser's result request lands on an arbitrary instance.

A naive design deadlocks turns, loses results to instance misrouting, or holds
model calls open forever waiting for a browser that left.

## What it buys here

| Guarantee | How | Naive alternative |
|---|---|---|
| **A turn can never hang on a silent host.** | Two hard bounds: no subscriber → immediate `no_connected_client`; no result in 30 s → `timed_out`. The model always receives a value. | An unbounded await; one closed tab parks a model call forever. |
| **Results survive load-balancer misrouting.** | Any instance persists the result durably and pokes the owner via `pg_notify`; the owner also polls the table as a fallback (target: `plan/08`). | A result POST that 404s on the wrong instance while the host already performed the action. |
| **No cross-turn or cross-workspace settle.** | Pending entries keyed `(assistantTurnId, commandId)`; the route validates the pair. | A leaked commandId settling someone else's pending call. |
| **The model hears the truth.** | The settled result feeds the tool loop; the timeline and the model agree on what happened. | UI shows "applied" while the model was told it timed out. |

## Decision

**1. The tool loop awaits the browser result in process, with hard bounds.**
When the model calls a declared host command, the runtime's tool call awaits a
pending entry in the service's `ServiceHostCommandResolver` (an in-memory map on
the owning instance). Two bounds guarantee the turn can never hang: no connected
stream subscriber → resolve immediately as `no_connected_client`; no result
within **30 seconds** → resolve as `timed_out`. Either way the model receives a
result value and generation continues.

**2. The result returns on a side-door route, not the stream.**
`POST /chat/turns/:assistantTurnId/host-commands/:commandId/result`. The stream
pauses (no events) during the await and resumes after settle; it never carries
anything browser-to-server.

**3. Results are relayed to the owner via the database, not instance affinity.**
Target design (`plan/08`; today the route settles only a local pending entry and
404s elsewhere): any instance receiving the result POST validates that the
command belongs to that turn, **persists the result durably**, and fires
`pg_notify` with `{assistantTurnId, commandId}` — a poke, never a payload — in
the same transaction. The owning instance's listener reads the persisted result
and settles its local await. A result landing on the owner settles directly
(fast path). While awaiting, the owner also **polls the result table** at a low
frequency, so a dropped LISTEN connection costs seconds of latency, not a
timeout.

**4. Correctness never depends on NOTIFY delivery.** The persisted row is the
truth and the poke is a latency optimization; a lost poke degrades to the poll,
then to the timeout — never to a stuck turn or a lost result. This is the same
poke-don't-payload discipline the cancel channel uses.

## Alternatives rejected

- **Stateless re-invoke** (end the model call at the tool call, persist loop
  state, start a new model call when the result arrives — the raw
  OpenAI/Anthropic client-tool pattern). Survives restarts, needs no resolver —
  but requires persisting and rehydrating full tool-loop state mid-turn. Too
  much machinery for fast UI actions; revisit only if durable approval gates
  become a requirement.
- **Sticky routing** for the result POST — pushes an infrastructure requirement
  onto every adopter (rejected across the board in ADR 0007).
- **Instance-to-instance forwarding** using the lease's owner id — assumes
  instances can reach each other (discovery, network policy); the DB relay
  reuses a connection that already exists.
- **Payload inside NOTIFY** — 8 KB limit plus at-most-once delivery would make
  correctness depend on the signal.
- **Unbounded await** — a turn parked on a human is a different feature
  (durable pause) and needs its own ADR; the 30-second bound is the fence.

## Consequences

Host commands are for **fast UI actions**, not approval gates: the await is
in-memory and 30-seconds-bounded, and `approvalMode` in the manifest is
validated but not enforced (`plan/24`). An instance crash mid-await loses the
pending entry with the fiber; the orphan sweep (`plan/05`) terminalizes the
turn. The silent pause makes SSE heartbeats necessary so proxies and client
watchdogs do not kill a healthy stream (`plan/17`). Mechanics, wiring, and the
failure-mode table live in
[host-commands.md](../architecture/host-commands.md).
