# Connection-Bound Streaming — Plan

Status: agreed, not yet built. **Supersedes** `resumable-streaming-v4-plan.md` and ADR
[0009](docs/adr/0009-resumable-server-owned-streaming.md) (durable `turn_events` + LISTEN/NOTIFY
replay). Pre-prod, so we break freely. Goal: simpler, more robust, and it lands host-command
round-trip cleanly.

## The model in one line

A turn runs server-side, owned by the instance that started it. Its tokens stream over the **live
connection only**; the **DB stores only the final answer**. UI tools need a live connection — no
connection, immediate error. No `turn_events`, no NOTIFY, no replay.

## Decisions

- **No Postgres NOTIFY / durable event replay.** Events live in memory on the owning instance.
- **Generation is independent of the connection.** Lose the connection → the turn still finishes and
  persists its final answer; the client re-reads it from the DB. No live resume.
- **UI (host) tools are connection-bound.** If the owning connection is gone when the model calls a
  UI tool, the tool returns an error and the model adapts. (Runtime round-trip already built; the
  service resolver enforces the connection requirement.)
- **Multiple live streams per tab.** The client keeps one run per conversation alive at once. Start a
  turn in chat A, switch to B and send there → both stream; switching only changes what is shown.
- **Refresh button** in the widget header → re-fetch the current conversation from the DB (manual
  catch-up now that auto-resume is gone).
- **Single-instance live for now**, with a clean `turnId → instanceId` routing seam for later. No
  cross-instance live streaming.

## Target architecture

### Server
- **In-memory running-turn registry** per instance: `Map<turnId, RunningTurn>`; `RunningTurn` holds the
  event buffer (so a slightly-late subscriber still gets the whole stream), a multicast emitter, status,
  and the pending UI-tool awaits.
- The **turn-runner stays server-owned** (already detached from the request). It emits to the multicast
  instead of `appendTurnEvent` + NOTIFY, and on terminal **persists one final assistant message**.
- **Stream endpoint**: find the turn in the registry → replay its in-memory buffer → tail. Not in the
  registry (finished/GC'd or other instance) → "not live" → client reads history.
- A turn left "running" with no owner past a TTL is swept to **failed** (startup sweep + lazy-on-read)
  so a crashed instance never leaves a turn hanging in the UI.

### Client
- **Run store: one run per conversation**, all kept alive across in-tab switches; the displayed
  conversation selects which run's view to render.
- On disconnect/refresh: **no live resume**. Read history; show the final answer once persisted; the
  header **Refresh** button (and focus) re-fetches.

### UI tools (host commands)
- Runtime tool `execute` awaits the service resolver (built). The resolver:
  - no live subscriber for the turn → **error result immediately** (`no_connected_client`);
  - subscriber present → emit the `host_command` event → await `POST …/host-commands/:id/result`;
    subscriber drops mid-await → error, never hang.
- Only the owning connection streams, so there is exactly **one dispatcher** — no per-tab targeting.

## Remove

`turn_events` table + repo + `appendTurnEvent`; LISTEN/NOTIFY; replay / `after` cursor; lease +
heartbeat + reaper + events pruner; the 250ms output-delta DB coalescing; client activity-stream
cross-tab resume and resume-on-refresh marker.

## Keep

Server-owned turns; the core stream-chat orchestration; host commands (now connection-bound);
conversation/message persistence; the widget run store + reducer + projection (simplified, multi-run).

## Phases (each verifiable)

1. **Server transport swap** — registry + multicast; runner emits to it + persists the final message;
   stream endpoint serves buffer+tail. Keep the two-call flow. Verify: stream a turn; disconnect →
   final answer persisted + readable from history.
2. **Connection-bound UI tools** — resolver checks for a live subscriber; no-connection → error;
   result-POST resolves. Verify: round-trip with a connection; error without.
3. **Client simplification** — multi-run store kept alive across switches; drop resume-on-refresh +
   cross-tab resume; add the Refresh button; history catch-up on load/focus.
4. **Delete dead machinery** — `turn_events` (schema + migration), NOTIFY, lease/reaper/pruner, DB
   coalescing. Net: large code removal.
5. **End-to-end browser verify** — in-tab stream + switch (two concurrent); disconnect → DB catch-up;
   UI tool connected (works) and disconnected (errors).

## Honest trade-off

We lose resilience to an instance crash *mid-generation* (that turn is marked failed; finished answers
are never lost). In exchange: far fewer moving parts, a predictable model, and clean host commands.
