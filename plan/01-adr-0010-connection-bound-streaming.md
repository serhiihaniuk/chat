# 01 — ADR-0010: Connection-bound streaming (supersedes ADR-0009)

**Epic:** 1 Streaming | **Priority:** P0 | **Depends on:** — | **Status:** todo

## Problem

Commits `b194451` → `8c0af7e` → `f2b5bb8` → `9961a6e` → `be8303f` → `349ba73` (2026-06-30, "connection-bound streaming P1–P4") deleted the durable `turn_events` table, the reaper, and the pruner, replacing the event transport with a per-instance in-memory registry (`apps/partner-ai-service/src/adapters/persistence/turn-events/in-memory-turn-event-log.ts`). But `docs/adr/0009-resumable-server-owned-streaming.md` is still status **accepted**, still promises durable-log resume, multi-instance fan-out, reaper and pruner — and explicitly rejects sticky routing. No decision record exists for the architecture the code actually has. Every reader (human or agent following the AGENTS.md mandatory reading path) is misled at the most load-bearing spot.

## Decided approach (owner-confirmed 2026-07-01)

Write `docs/adr/0010-connection-bound-streaming.md` recording the claude.ai-style model:

- **One connection owns the live stream.** `POST /chat/runs` returns the SSE stream directly as its response body (single HTTP call — the connection that starts the turn is physically attached to the owning instance; no LB affinity needed, no sticky routing).
- **Final state lives in Postgres.** Refresh / other tabs / other devices read the completed message from conversation history once the turn is terminal. Live mid-turn replay across instances is explicitly a non-goal.
- **Multi-instance works turn-independently.** Any instance serves the next turn because all context (history) is read from the DB. Cross-instance cancel and activity stay on the existing LISTEN/NOTIFY channels.
- **Same-instance resume is best-effort.** `GET /chat/turns/:id/stream` remains for same-instance reconnects but fails fast (structured JSON error) when the instance doesn't own a running turn; the client falls back to polling turn status until terminal, then refetches history (story 07).
- **Crash recovery** is a lease-based orphan sweep (story 05), not a durable log.
- **Rationale for rejecting the old design:** the durable-log + NOTIFY fan-out was implemented and worked, but was judged too complex and performance-heavy for the product need; the trade-off (no cross-instance/cross-restart live replay) is accepted deliberately.

## Tasks

1. Read `docs/adr/0009-resumable-server-owned-streaming.md` and `docs/adr/README.md` for the house ADR format.
2. Write ADR-0010 with: context (what P1–P4 removed and why), the decision bullets above, consequences (accepted losses: mid-turn cross-instance resume, replay after restart; retained: durable turn *status* + messages, cancel/activity NOTIFY), and the stories 02–09 as the implementation plan.
3. Mark ADR-0009 status **superseded by 0010** (keep the file — it documents real history; add one line at the top).
4. Do NOT rewrite the architecture docs here — that is story 10, after implementation lands.

## Acceptance criteria

- [ ] `docs/adr/0010-connection-bound-streaming.md` exists, follows the local ADR format, and names stream-from-POST, fail-fast resume, poll-until-terminal fallback, NOTIFY host-command relay, and the orphan sweep.
- [ ] ADR-0009 header says superseded and links 0010.
- [ ] No other doc is modified (story 10 owns that).

## Verification

```sh
npm run lint:custom   # docs gate: ADRs are exempt from the header contract but run it anyway
```
