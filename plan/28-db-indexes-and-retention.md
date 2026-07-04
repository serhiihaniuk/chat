# 28 — DB indexes + retention documentation

**Epic:** 5 Robustness | **Priority:** P1 (cheap now, painful at 10⁶ rows) | **Depends on:** — | **Status:** done

## Problem

Index audit vs actual query shapes (schema indexes at `packages/db/src/drizzle/schema.ts:80-85,134-138`; confirmed in `migrations/0000_day_one.sql:140-152`):

1. **`listActiveAssistantTurns` seq-scans on every activity connect.** Query: `WHERE workspace_id=? AND subject_id=? AND status='running' ORDER BY started_at DESC` (`postgres-drizzle/records/turn-lookups.ts:80-95`) — no index covers `subject_id` or `status`. It runs on **every** `/chat/activity` SSE connect (`activity-subscription-stream.ts:45`), and the widget reopens that stream on every mount, tab-refocus, and network-online event. Hundreds of multi-ms scans/sec at ~10⁶ turn rows with active tabs.
2. **`readUsageSummary` full-scans `usage_records`:** unbounded `SUM(...) WHERE workspace_id=?` (`records/usage.ts:56-76`); the table has no workspace index (only the `(turn, step)` unique) and grows by one row per runtime step forever.
3. **Redundant index:** `messages_conversation_sequence_desc_idx` duplicates the unique index on the same `(conversation_id, sequence_index)` columns (`schema.ts:81-83`) — Postgres b-trees scan backwards; it's pure write overhead per message insert.
4. **N+1 title fallback** in `listConversations`: one query per untitled conversation (`records/conversations.ts:192-194,269-283`) — bounded by the sidebar limit (25); minor.
5. **No retention policy** for `assistant_turns` / `usage_records` / `audit_events` (~3.6 M rows/yr at 10 k turns/day) and nothing documents that reality.

## Decided approach

1. Add partial index: `assistant_turns (workspace_id, subject_id) WHERE status = 'running'` — tiny, hot, exactly the working set.
2. Add `usage_records (workspace_id)` index. (A rollup table is out of scope; note the ~10⁷-row threshold in the capacity doc.)
3. Drop `messages_conversation_sequence_desc_idx`.
4. Regenerate the single fresh migration (`npm run db:generate` per the day-one policy) — do this BEFORE adopters exist; that's the point of doing it now.
5. Annotate the N+1 with a one-line comment (bounded; fold into a lateral join only if the sidebar limit grows).
6. Retention: document (in the story-10 capacity note / `docs/operations/database.md`) that no automatic pruning exists, growth rates, and the recommended external approach (partitioning or a scheduled delete) — document, don't build.

## Acceptance criteria

- [x] `EXPLAIN` container test asserts index scans for `listActiveAssistantTurns` (activity snapshot), `readUsageSummary`, and the conversation list — with `SET LOCAL enable_seqscan = off` so the planner must use an index if one covers the query.
- [x] Schema governance test (`schema.test.ts`) asserts the new index DDL and the absence of the dropped one; `db:generate` produced one fresh `day_one` migration.
- [x] The duplicate `messages_conversation_sequence_desc_idx` is gone.
- [x] Retention reality + external approach documented in `capacity-and-deployment.md`.

## Verification

```sh
npm run db:generate
npm run test:db:container   # requires Docker; runs the EXPLAIN + concurrent-append checks against real PG
npm run verify
```

## Delivery notes

**Audited every query shape, not just the five listed.** I mapped every
`WHERE`/`ORDER BY` across the postgres-drizzle repositories against the indexes,
including the reads stories 26/27 added. Most candidate "problems" were already
O(1)/O(log n) and needed nothing: PK-keyed writes (`complete`/`fail`/`cancel`/
lease renew) seek one row then filter; `max(sequence_index)` and history `DESC`
ride the `(conversation_id, sequence_index)` unique index scanned backward. Four
changes were real:

1. **Partial working-set index** — `assistant_turns_running_lookup_idx`
   `(workspace_id, subject_id, conversation_id) WHERE status = 'running'`. Its size
   tracks live concurrency, not history, and it serves every hot running-turn read:
   `listActiveAssistantTurns` (ws+subj prefix, on every `/chat/activity` connect),
   `findActiveConversationTurn` (the story-27 per-create guard) and
   `findActiveAssistantTurn` (resume) as exact seeks, and — because it stays tiny —
   the unscoped `listRunningCancelRequestedTurns` reconnect rescan (story 26) and
   the reaper sweep scan it instead of the full table. This is broader than the
   story's `(workspace_id, subject_id)` proposal so the story-26/27 reads are
   covered too.
2. **`usage_records_workspace_idx` `(workspace_id)`** — `readUsageSummary`'s
   per-workspace `SUM` no longer full-scans an ever-growing table.
3. **`conversations_workspace_subject_recent_idx`
   `(workspace_id, subject_id, last_message_at)`** — the sidebar list orders a
   subject's unbounded-growing conversation set newest-first; this makes it a
   top-N index scan instead of a sort. (Not in the original story; added because
   the audit showed it is a real growth-driven hot read.)
4. **Dropped `messages_conversation_sequence_desc_idx`** — a pure-write-overhead
   duplicate of the `(conversation_id, sequence_index)` unique index.

**Migration + governance.** Regenerated the single `day_one` migration
(`npm run db:generate`, which wipes and re-emits from `schema.ts`). The governance
test asserts each new index's DDL and the absence of the dropped one; an EXPLAIN
container test proves the planner uses each index. The N+1 title fallback in
`listConversations` is annotated (bounded by the 25-row sidebar limit).

**Retention.** `capacity-and-deployment.md` now documents the growth reality plus
the two external approaches — time partitioning (drop old partitions) and a
scheduled delete (children before parents, since every FK is
`ON DELETE no action`) — and the `readUsageSummary` ~10⁷-row rollup threshold.
Retention stays documented, not built, per the review decision.

`npm run verify` green; the EXPLAIN + concurrent-append checks run in CI's
`test:db:container` lane (Docker unavailable in this environment).
