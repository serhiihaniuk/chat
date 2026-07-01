# 28 — DB indexes + retention documentation

**Epic:** 5 Robustness | **Priority:** P1 (cheap now, painful at 10⁶ rows) | **Depends on:** — | **Status:** todo

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

- [ ] `EXPLAIN` (container test or manual) shows index scans for `listActiveAssistantTurns` and `readUsageSummary`.
- [ ] Schema governance test (`schema.test.ts`) updated for the index changes; `db:generate` produced one fresh migration; `test:db:container` green.
- [ ] The duplicate index is gone.
- [ ] Retention reality documented.

## Verification

```sh
npm run db:generate
npm run test:db:container
npm run verify
```
