# Foundation Fix Plan — Overview

Source: `FOUNDATION-REVIEW.md` (repo root, 2026-07-01). Every story is self-contained and agent-executable: hand one file to a fresh session and it has the problem, evidence, decided approach, tasks, acceptance criteria, and verification.

**Locked architecture decision for Epic 1:** connection-bound streaming, **stream-from-POST** variant. No sticky routing, no durable event log. One active connection holds the live stream; refresh/other tabs read final messages from the DB; any instance serves the next turn. `docs/adr/0007-connection-bound-streaming.md` records this (written 2026-07-02 as part of story 01, which also executed the full docs greenfield pass; the ADR set was rebaselined and renumbered in reading order — see `docs/adr/README.md`).

**Rules for executors:** follow `AGENTS.md` (final-state rule: no compat shims, delete replaced code in the same patch). Run the narrowest tests first, then `npm run verify` before calling a story done. Update docs in the same patch when a story changes lifecycle, protocol, or ownership. Mark the story's Status line when starting/finishing.

## Execution order and dependencies

Within an epic, execute in file order. Epics 2, 3 can run parallel to Epic 1 except where noted.

| #   | Story                                                                              | Epic          | Depends on              |
| --- | ---------------------------------------------------------------------------------- | ------------- | ----------------------- |
| 01  | ADR + docs greenfield pass — **done 2026-07-02**                                   | 1 Streaming   | —                       |
| 02  | Stream from POST /chat/runs (server) — **done 2026-07-02**                         | 1 Streaming   | 01                      |
| 03  | Widget consumes the POST stream — **done 2026-07-02**                              | 1 Streaming   | 02                      |
| 04  | Resume GET: fail fast + no ghost entries — **done 2026-07-02**                     | 1 Streaming   | 02                      |
| 05  | Orphan-turn reaper sweep — **done 2026-07-02**                                     | 1 Streaming   | —                       |
| 06  | Widget run→history handoff on terminal — **done 2026-07-02**                       | 1 Streaming   | —                       |
| 07  | Widget transport resilience (retry, poll fallback, watchdog) — **done 2026-07-02** | 1 Streaming   | 03, 04, 06              |
| 08  | Host-command result relay (multi-instance) — **done 2026-07-02**                   | 1 Streaming   | 02                      |
| 09  | Subscription gap fix + terminal guarantees — **done 2026-07-02**                   | 1 Streaming   | —                       |
| 10  | Post-implementation docs delta + dead knobs + comment purge — **done 2026-07-02**  | 1 Streaming   | 02–09                   |
| 11  | Fix the fake-provider quick start — **done 2026-07-02**                            | 2 First-run   | —                       |
| 12  | Single config system (remove legacy parser, loud failures) — **done 2026-07-02**   | 2 First-run   | 11                      |
| 13  | CI workflow                                                                        | 2 First-run   | —                       |
| 14  | LICENSE + README claim corrections                                                 | 2 First-run   | —                       |
| 15  | Rename `partner-ai-*` → `sidechat-*`                                               | 2 First-run   | do LAST in epic 2       |
| 16  | sidechat.blocked completeness + schema honesty                                     | 3 Protocol    | —                       |
| 17  | SSE codec robustness + server heartbeats                                           | 3 Protocol    | —                       |
| 18  | Runtime abort + single-terminal enforcement                                        | 3 Protocol    | —                       |
| 19  | Widget terminal semantics (cancelled/blocked/replay)                               | 3 Protocol    | 16                      |
| 20  | Injectable auth seam + subject scoping                                             | 4 Seams       | —                       |
| 21  | Real tool registration seam + promise factory                                      | 4 Seams       | —                       |
| 22  | Model call-settings seam                                                           | 4 Seams       | —                       |
| 23  | Render protocol content + custom renderer seam                                     | 4 Seams       | —                       |
| 24  | Core cleanup: dead Layer machinery, port invariants, approval honesty              | 4 Seams       | —                       |
| 25  | Extension docs completion (context, tables, migrations, host commands)             | 4 Seams       | 20–24                   |
| 26  | Postgres connection resilience + pool config                                       | 5 Robustness  | 36                      |
| 27  | Persistence races + fiber observability + fail-open telemetry                      | 5 Robustness  | 05, 36                  |
| 28  | DB indexes + retention documentation                                               | 5 Robustness  | —                       |
| 29  | Widget instance isolation + lifecycle cleanup                                      | 5 Robustness  | 03                      |
| 30  | Widget e2e reconciliation + CI wiring — **suite green 2026-07-02; CI remains**     | 6 Widget UI   | 13, 19, 23              |
| 31  | Widget dead-code purge + dark-mode alignment                                       | 6 Widget UI   | —                       |
| 32  | Theme single-sourcing + add-a-theme recipe                                         | 6 Widget UI   | 31                      |
| 33  | Composer correctness + real context ring                                           | 6 Widget UI   | —                       |
| 34  | Labels/rebranding surface + mobile bottom sheet                                    | 6 Widget UI   | —                       |
| 35  | Core tree flattening + naming de-collisions                                        | 7 Readability | after epics 1–5         |
| 36  | Observability foundation + dev console logs (ADR 0011)                             | 5 Robustness  | — (run FIRST in epic 5) |

## Status legend

Each story carries `**Status:** todo | in-progress | done | blocked(<why>)`. Update it in the story file itself; this table is not a status board.

## Deleting this folder

The folder is a working plan, not durable documentation (deliberately outside `docs/` so the docs gate doesn't apply). When all stories are done, delete `plan/` in the same patch as the last story, per the final-state rule.
