# Side Chat — Foundation Re-Review

**Date:** 2026-07-06
**Baseline:** `FOUNDATION-REVIEW.md` (2026-07-01) and the 36-story fix plan in `plan/` derived from it.
**Scope:** did the work fix what the review found — verified against the code, not the story files.
**Method:** single-pass direct verification (no subagents). Every closed finding below was re-checked by grep or by reading the current source; the streaming, title, font, and request-behavior claims were additionally exercised live in a browser against the real service (gpt-5.4-mini, Postgres and in-memory both). File references are to the current tree.

---

## Executive summary

**The pivot is finished.** The original review's core diagnosis was that the repo disagreed with itself about its own architecture — a deleted durable-log design still taught everywhere, four gaps breaking the intended connection-bound model, and safety jobs removed without replacement. All four gaps are closed in code, the ADR set was rebaselined (0001–0013, with `0007-connection-bound-streaming` and `0008-crash-recovery-lease-sweep` recording the decisions the review demanded), and the docs now describe the system that exists. 33 of 36 stories are done.

**What remains is exactly three stories plus one tail**, all deliberately deferred: CI (13), LICENSE + README claims (14), the `partner-ai-*` → `sidechat-*` rename (15, correctly scheduled last), and story 30's CI-wiring remainder. None are code risks; two of them (CI, LICENSE) are still the adoption blockers they were on day one.

**Live testing after the plan found real bugs the plan couldn't have caught** — including one P0 (every second message in a conversationless conversation returned 500). All are fixed; details in §4. This is the strongest argument for story 13: the repo's verification gates are excellent and still only run when someone remembers.

---

## 1. The four streaming gaps — all closed (verified in code)

| Original gap (§2 of the review)                                         | State                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2.1** Stream GET lands on a non-owner and hangs forever               | **Fixed — stream-from-POST**   | `POST /chat/runs` _is_ the SSE stream (ADR 0007). The resume GET now fails closed before any SSE frame: non-owner + running → `stream_unavailable` JSON; swept terminal → `replay_expired` (`apps/partner-ai-service/src/inbound/http/routes/chat/turns/chat-turns.ts:85-130`). Subscribing no longer creates ghost registry entries (subscribe never creates an entry — `in-memory-turn-event-log.ts:99-106`). Host-command results relay cross-instance via persisted result + NOTIFY dispatcher (`service-composition.ts:209-214`). |
| **2.2** Crashed instance strands turns `running` forever                | **Fixed — reaper reinstated**  | `turn-reaper.ts` sweeps `reapExpiredTurns` from composition, all instances concurrently (`SKIP LOCKED`); widened predicate covers the NULL-lease window (`turn-lease.ts:160-174`); ADR 0008 records the design.                                                                                                                                                                                                                                                                                                                        |
| **2.3** Widget gives up on any blip; live→history handoff never happens | **Fixed — and exercised live** | Run→history handoff on terminal (`use-widget-run-effects.ts:145-186`: fetch-then-clear with settle retry); reconnect triggers + watchdog (`features/chat/model/reconnect/`); header Refresh does a real forced read. Verified in a real browser: mid-turn refresh reads the committed answer from the DB; a completed turn hands off with no shadowing.                                                                                                                                                                                |
| **2.4** Docs/ADR/dead surface teach the deleted design                  | **Fixed**                      | ADR set rebaselined in reading order; `docs/adr/0007` supersedes the old durable-log ADR. `packages/db/README.md` has zero references to `turn_events`/reaper-as-transport. Dead knobs (`turnEventRetention`, `prunerInterval`) — zero hits in source. The root README's only "durable event log" mention is the honest "chosen over" phrasing (`README.md:69`).                                                                                                                                                                       |

---

## 2. The rest of the review, by section

### First-run and template experience (§3) — mostly fixed, the two adoption blockers remain

- **Fake quick start works by design now**: a dedicated `sidechat.fake.config.ts` ships and `run-local-fake.mjs` selects it — the boot path no longer depends on env-var archaeology.
- **The silent dual-config universe is gone**: the 279-line legacy `service-config.ts` is deleted (story 12); one config system remains.
- **Still missing: CI (story 13) and LICENSE (story 14).** No `.github/`, no `LICENSE` file. Unchanged since the original review, and the review's judgment stands: a minimal workflow running `npm run verify` is the single highest-leverage addition. §4's lint episode is a live demonstration.
- **Naming (story 15)**: `partner-ai-service`/`partner-ai-core` still ship under the old name; correctly deferred to last (fewest open branches).

### Adopter seams (§4) — all six delivered

| Seam                  | Then                                         | Now                                                                                                                 |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Auth                  | one shared synthetic subject, not injectable | `authVerifier` injectable (`inbound/http/app.ts`, `index.ts`); turn routes subject-scoped (`chat-turns.ts:144,184`) |
| Tool via config       | mock-only fiction                            | real name→registration map (`options-adapter.ts:183-191`)                                                           |
| Tool in code          | Effect-fluent only                           | `create-runtime-tool-from-promise.ts` (agent-runtime) — the promise-first helper the review asked for               |
| Tool-result rendering | no seam, rendered as nothing                 | `renderActivityItem` seam threaded through the conversation UI (story 23)                                           |
| Model parameters      | hardcoded                                    | `callSettings` bag on the runtime request (`ai-runtime-contract/src/index.ts:71-123`)                               |
| Dead Layer machinery  | 178 unused lines sold as canonical           | deleted (`effect-runtime.ts` gone); the plain ports object is the story                                             |

### Protocol completeness (§5) — closed structurally, not just patched

The fix went further than the review asked: the sequence validator no longer re-enumerates terminals at all — terminality is owned solely by `isTerminalEvent` (completed/error/blocked), so a new terminal member cannot silently diverge (`ordering/sequence.ts:13-15`). A `protocol-completeness.test.ts` pins schema ↔ event-type ↔ validator agreement. Both browser decoders skip comment/dataless frames, and the server now sends the SSE heartbeats (20 s default) whose absence the review flagged as an LB time-bomb.

### Robustness (§6) — the crash class is gone

- `pool.on("error")` handler (`postgres-drizzle/index.ts:59`); every LISTEN channel runs on a `reconnectingListenStream` with its own drop/reconnect test. The "dropped idle connection = process crash" failure mode no longer exists.
- The append sequence race is fixed with a conversation row lock before the `max(sequence_index)` read, with the unique index as backstop (`records/conversations.ts:51-77`).
- Telemetry is fail-open — the doc comment now leads with it (`stream-chat-observability.ts:11`).

### Widget UI (§7) and performance (§8) — delivered

- e2e suite reconciled with the shipped UI (now under `test-harness/widget-harness/e2e/`; green 2026-07-02) — CI wiring is the story-30 remainder.
- Dark-mode remnants: zero hits. Theme data single-sourced (story 32). Labels/rebranding surface + mobile bottom sheet shipped (34). Composer IME/focus/Ctrl+Enter and an honest usage-driven context meter shipped (33) — the meter was verified live this session.
- Both indexes exist: the partial running-turns index (`schema.ts:149-158`) and `usage_records_workspace_idx` (`schema.ts:210`). Pool `max`/`ssl` are config-exposed (`environment-config-types.ts:41-49`).

### Readability (§9) — the tree now tells the truth

`partner-ai-core` is 20 directories (was 36). The naming de-collisions all landed in story 35: `ToolCatalog` alias gone, the two `toRuntimeError`s split into intent-named functions, `readString` families merged, user/assistant message ids are distinct brands, and the dead vocabulary (`sidechat.history` event, `event_log_conflict`) is deleted rather than documented.

---

## 3. What the plan-era work is worth — an honest quality read

The original review said the per-layer engineering was strong and the risk was self-disagreement. The re-review's read: **the repo now agrees with itself.** The pattern that stands out across the 33 stories is that fixes were made _structural_ where the review only asked for patches — terminality owned by one predicate instead of three copies; theme/appearance data single-sourced instead of synced; the activity/cancel/result LISTEN channels all sharing one reconnecting source; the conversation-title, handoff, and reaper behaviors each carrying a test that pins the invariant rather than the implementation.

---

## 4. New findings from post-plan live testing (2026-07-05/06)

Running the full stack with a real model and driving the widget in a browser surfaced bugs no static pass caught:

1. **P0 — second message in a conversationless conversation always 500'd.** The first turn stores `conversation_key = conversationless:<requestId>`; the follow-up passed the conversation id as the key, so the upsert's `ON CONFLICT` target missed and the insert hit `conversations_pkey`. Fixed with a byId-first lookup extracted to `conversation-create.ts`, plus a contract regression test that runs against both Postgres and memory. Committed (`3617015`).
2. **Request storm per message** — a follow-up turn fired 7 API requests (3 identical history reads, one canceling another; 3 list reads back-to-back). Fixed: `fetchQuery`-based history refresh that dedupes with the query's own in-flight fetch, first-connect skip on the activity stream, and a spaced title poll. Measured live: 7 → 3 requests, no canceled reads.
3. **Conversation title never updated without a manual refresh.** The server generates the title _after_ the turn completes (a separate model call, ~2–3 s), so the single post-turn list read always missed it. Fixed with a bounded spaced poll that stops the moment the generated title lands (`widget-title-refresh.ts`, ≤6 reads, 1.5 s cadence). Verified live twice: fallback title replaced automatically within seconds.
4. **The typeface setting was a placebo — for a new reason.** Story 33 fixed the placebo _controls_; live testing found the fonts themselves never loaded: `styles.css` (package root) pointed `@font-face` at `./fonts/…` while the files live at `./src/fonts/…`, so every request 404'd to the SPA fallback and all three typefaces rendered as the same system font. This was exactly the "fonts deferred" leftover noted in story 31. Fixed (3 URL edits) + a url→file resolution check added to the stylesheet completeness test (`widget-themes.test.ts`). Verified live: three distinct rendered widths, live switch without reload.
5. **The sidebar "generating" dot never updates live on in-memory persistence — by design.** Memory persistence uses the no-op activity notification source (`notification-sources.ts:52-58`); only the snapshot-on-connect populates dots. On Postgres the dot works (live `pg_notify` on start/complete/fail — owner-verified). Decision recorded: keep in-memory lean; use Postgres (`npm run dev` default) for full-fidelity testing.
6. **Meta-finding:** during this session a "verify green" claim was briefly wrong — a background run's exit code was misread, hiding five lint errors in the two new test files. The errors were caught, fixed, and verify re-run. A CI gate (story 13) makes this class of mistake impossible rather than merely unlikely.

Uncommitted at the time of writing: fixes 2–4 above plus a small refresh-button spin animation (`widget-frame.tsx` + `styles.css`), all passing `npm run verify`.

---

## 5. What remains

| Item                                                | Why it still matters                                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Story 13 — CI**                                   | The review called it the highest-leverage governance addition; §4.6 re-proved it. `npm run verify` + `test:db:container` in a workflow.                                                                               |
| **Story 14 — LICENSE + README claims**              | Legal blocker for any adopter; unchanged.                                                                                                                                                                             |
| **Story 15 — rename `partner-ai-*` → `sidechat-*`** | Do last, as planned — after 13/14 land.                                                                                                                                                                               |
| **Story 30 remainder**                              | Wire the reconciled e2e suite into CI (depends on 13) + the deferred fidelity scenarios.                                                                                                                              |
| **Delete `plan/`**                                  | Per the plan's own final-state rule, in the same patch as the last story. This report supersedes `FOUNDATION-REVIEW.md` as the current-state record; keep the original as the historical baseline until `plan/` goes. |

---

## 6. Updated per-area verdicts

| Area                      | 2026-07-01 verdict                                             | 2026-07-06 verdict                                                                                |
| ------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Streaming architecture    | broken at 2 instances; repo self-contradictory                 | connection-bound model implemented, documented (ADR 0007/0008), fail-fast on every non-owner path |
| `partner-ai-core`         | strong but dead Layer path, 36-dir tree                        | dead code gone, 20 dirs, port invariants written down                                             |
| `apps/partner-ai-service` | seams advertised but not pluggable; silent config fallback     | auth/tools/params injectable; one config system                                                   |
| `packages/db`             | excellent patterns, crash-prone connection layer, stale README | reconnecting LISTEN + pool error handling; README truthful; append race locked                    |
| `chat-protocol`           | blocked-terminal divergence in three copies                    | terminality single-sourced + completeness test                                                    |
| Widget (state)            | resilience half-built                                          | handoff/retry/watchdog shipped and live-verified; post-plan request/title fixes landed            |
| Widget (UI)               | mid-molt: dead code, dark remnants, placebo controls           | purged, single-sourced, controls real (typeface required the §4.4 asset fix)                      |
| Template/DX               | no CI, no LICENSE, first command crashed                       | quick start works; **CI and LICENSE still missing — the last P0s**                                |

---

_Method note: all "Fixed" claims were verified against the current source during this re-review; streaming handoff, title refresh, typeface switching, request counts, and the activity dot were additionally verified in a live browser session against the real service. Stories 13/14/15/30-CI were verified still-open (no `.github/`, no `LICENSE`, old package names, no CI-wired e2e)._
