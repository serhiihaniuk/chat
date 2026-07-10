# Step 09: Persistence — Schema and Write Path

Read this when: defining the native stack's storage shapes and the durable write path.

Source of truth for: the schema (UIMessage messages, turns, tool/approval rows), id policy, and write-path idempotency.

Not source of truth for: read paths/pruning (Step 10) or database tooling (docs/operations/database.md).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 05 (interfaces agreed; may run in parallel with 06–08). Unblocks: Steps 10, 11, 12.

## Outcome

`UIMessage` (id, role, parts, metadata) is the single durable message shape — identical to the stream and the widget. Turns carry status/usage/`run_id`. The write path is idempotent under workflow replay. No lease columns exist. Pre-alpha: schema changes reset the database; no data migration.

## Current evidence to verify

- Current schema + repo conventions: `packages/db/src/schema.ts` (verify path), `src/repositories/contract.ts`, `postgres-drizzle/index.ts`.
- Lease shapes to omit: ADR 0008 columns/tables.
- DB tooling: edit schema → `npm run db:generate` (single fresh migration) + `npm run db:reset`; grants in `sql/runtime-role-grants.sql`; env `SIDECHAT_DATABASE_URL`.

## Target schema (drizzle; final DDL in handoff)

- `conversations`: as-is (id, tenant refs, title, timestamps).
- `messages`: `id` (server-generated, stable), `conversation_id`, `role`, `parts jsonb`, `metadata jsonb`, ordering column, `created_at`. Indexed for ordered listing. The jsonb is the truth; extracted columns are query aids only.
- `turns`: identity, conversation ref, status (`running|completed|failed|cancelled|blocked` — Step 01 vocabulary), usage (v7 token-detail shape), `run_id` `[workflow-branch]`, timestamps, and **provenance columns** (regulated-deployment requirement, `KNOWLEDGE.md` §Regulated): exact model id, instructions/config version, and content-filter version active for the turn — these make the retained record auditable ("which model and system prompt produced this answer"). **Partial unique index: one `running` turn per conversation** (backs Step 05's race-safe busy check). No lease columns.
- `conversations` additionally carry a **legal-hold flag**: any deletion/pruning path (incl. Step 10's sweep for associated runs) must skip held conversations. Cheap now, always demanded later in regulated deployments.
- `client_tool_dispatches` and `tool_approvals`: rows as specified by Steps 11/12 (created here; semantics owned there).
- `[workflow-branch]` workflow tables live in their own schema (world config); product code never joins them.

## Write path

- **Ids**: AI SDK `createIdGenerator()` creates all `UIMessage.id` values with one configured prefix/size; repository DB-id utilities continue to create conversation/turn/audit row ids. Never derive ids from mutable content.
- **User message**: persisted in the Step 05 route after admission.
- **Assistant message**: persisted in `onEnd` from the final `UIMessage` (verify what the pinned version hands the callback — final message vs assembling from `steps`/`responseMessages`; record which). **Upsert keyed on the deterministic message id** — `[workflow-branch]` `onEnd` may replay after a crash.
- **Terminal transition**: `running → terminal` is a guarded state transition executed once; a second attempt is a no-op. Combined with the workflow-level catch (Step 05), the invariant holds: **no turn ends without durable status** — this replaces the reaper.
- **Usage**: from the end event's aggregate usage (v7 aggregates across steps; `finalStep` is last-step-only — don't confuse them).
- **Failure path**: persist exactly the client-visible partial assistant `UIMessage` on mid-stream failure; the turn row carries `failed` plus the safe error code. Do not discard already-rendered text and do not append raw provider error content to message parts.

## Edge cases (each a test)

1. stream-then-load equality: the persisted `UIMessage` deep-equals what a client folding the full chunk stream holds (parts, ids, metadata);
2. crash between terminal chunk and persist `[workflow-branch]` → replay re-runs `onEnd` → exactly one message row, one terminal transition;
3. duplicate `onEnd` (defensive) → idempotent;
4. concurrent second turn while one is `running` → unique-index rejection surfaces as the busy error (race-safe, not check-then-act);
5. tenant isolation on every write (two-tenant test);
6. empty assistant message (Step 08 case) persists with a sane shape.

## Verification

```powershell
npm run db:generate
npm run db:reset
npm test -- packages/db
npm test -- apps/side-chat-service/src/persistence
npm run test:db:container
npm run typecheck
npm run lint:custom
```

If the container command is unavailable, the step stays `in_review`, not `complete`, until disposable-Postgres evidence exists.

## Completion checklist

- [ ] Schema via standard drizzle workflow; no lease shapes; DDL recorded.
- [ ] Idempotent assistant upsert + guarded terminal transition proven under replay.
- [ ] Partial unique index backing the busy check.
- [ ] All six edge cases pass; container evidence recorded.

## Handoff record

Final DDL and id policy: pending

`onEnd` payload source used: pending

Partial-persist invariant evidence: pending
