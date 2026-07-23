# Step 09: Persistence — Schema and Write Path

Read this when: defining the native stack's storage shapes and the durable write path.

Historical source for: the schema (UIMessage messages, turns, tool/approval rows), id policy, and write-path idempotency.

Not authoritative for: read paths/pruning (Step 10) or database tooling (docs/operations/database.md).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 05 (interfaces agreed; may run in parallel with 06–08). Unblocks: Steps 10, 11, 12.

## Outcome

`UIMessage` (id, role, parts, metadata) is the single durable message shape — identical to the stream and the widget. Turns carry status, usage, and `run_id`. The write path is idempotent under workflow replay. No lease columns exist. Pre-alpha: schema changes reset the database; no data migration.

## Current evidence to verify

- Current schema + repo conventions: `packages/db/src/schema.ts` (verify path), `src/repositories/contract.ts`, `postgres-drizzle/index.ts`.
- Lease shapes to omit: the deleted owner/epoch/expiry heartbeat columns and sweep tables from the pre-Workflow architecture.
- DB tooling: edit schema → `npm run db:generate` (single fresh migration) + `npm run db:reset`; grants in `sql/runtime-role-grants.sql`; env `SIDECHAT_DATABASE_URL`.

## Target schema (drizzle; final DDL in handoff)

- `conversations`: as-is (id, tenant refs, title, timestamps).
- `messages`: `id` (server-generated, stable), `conversation_id`, `role`, `parts jsonb`, `metadata jsonb`, ordering column, `created_at`. Indexed for ordered listing. The jsonb is the truth; extracted columns are query aids only.
- `turns`: identity, conversation ref, status (`running|completed|failed|cancelled|blocked` — Step 01 vocabulary), usage (v7 token-detail shape), `run_id`, timestamps, and **provenance columns** (regulated-deployment requirement, `KNOWLEDGE.md` §Regulated): exact model id, instructions/config version, and content-filter version active for the turn. **Partial unique index: one `running` turn per conversation**. No lease columns.
- `conversations` additionally carry a **legal-hold flag**: any deletion/pruning path (incl. Step 10's sweep for associated runs) must skip held conversations. Cheap now, always demanded later in regulated deployments.
- `client_tool_dispatches` and `tool_approvals`: rows as specified by Steps 11/12 (created here; semantics owned there).
- Workflow tables live in their own Postgres World schema; product code never joins them.

## Write path

- **Ids**: AI SDK `createIdGenerator()` creates all `UIMessage.id` values with one configured prefix/size; repository DB-id utilities continue to create conversation/turn/audit row ids. Never derive ids from mutable content.
- **User message**: persisted in the Step 05 route after admission.
- **Assistant message**: persisted in `onEnd` from the final `UIMessage`. **Upsert keyed on the deterministic message id** because `onEnd` may replay after a crash.
- **Terminal transition**: `running → terminal` is a guarded state transition executed once; a second attempt is a no-op. The Workflow finalizer owns the normal path. [ADR 0010](../../docs/adr/0010-terminal-projection-reconciliation.md) adds a bounded cross-schema backstop when the Workflow run is terminal or missing but the product row still says `running`; it does not restore lease or age-based death detection.
- **Usage**: from the end event's aggregate usage (v7 aggregates across steps; `finalStep` is last-step-only — don't confuse them).
- **Failure path**: persist exactly the client-visible partial assistant `UIMessage` on mid-stream failure; the turn row carries `failed` plus the safe error code. Do not discard already-rendered text and do not append raw provider error content to message parts.

## Edge cases (each a test)

1. stream-then-load equality: the persisted `UIMessage` deep-equals what a client folding the full chunk stream holds (parts, ids, metadata);
2. crash between terminal chunk and persistence → replay re-runs `onEnd` → exactly one message row and terminal transition;
3. duplicate `onEnd` (defensive) → idempotent;
4. concurrent second turn while one is `running` → unique-index rejection surfaces as the busy error (race-safe, not check-then-act);
5. tenant isolation on every write (two-tenant test);
6. empty assistant message (Step 08 case) persists with a sane shape.
7. terminal Workflow run plus product `running` row → the reconciler records a safe failed terminal projection once;
8. missing bound Workflow run plus product `running` row → the reconciler records a safe failed terminal projection once;
9. cancel against a terminal or missing bound run → reconcile or record cancellation and acknowledge instead of returning resource unavailable.

## Strict conformance audit — 2026-07-15

The audit reopened this step because `TurnStore.beginTurn` and
`ARCHITECTURE.md` require one atomic acceptance boundary, while the PostgreSQL
adapter called `createOrGetConversation`, `appendMessage`, and
`startAssistantTurn` as three independent transactions. A busy race or process
failure after the append could therefore leave a visible user message without
an assistant turn. A replayed `requestId` could also append a different message
before `startAssistantTurn` returned the earlier turn.

The repair belongs in `packages/db`: one aggregate repository operation must
create or resolve the owned conversation, validate exact replay identity,
append the accepted user message, and open the assistant turn in one
transaction. It must return whether the request created or reused the canonical
turn so the service cannot start a second Workflow run. Completion requires
disposable-Postgres tests for rollback after each stage, busy rejection with no
message residue, exact replay with no duplicate rows, and mismatched replay
rejection. The repository now implements that aggregate transaction and the
disposable-Postgres evidence covers all four failure classes, so the audit is
closed.

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

- [x] Schema via standard drizzle workflow; no lease shapes; DDL recorded.
- [x] Atomic aggregate finalization + guarded terminal transition proven under replay.
- [x] Partial unique index backing the busy check.
- [x] Edge cases proven against a real container (see deviations for 1/6).
- [x] Atomic aggregate begin proven for first turn, busy races, crashes, and request replay.

## Handoff record

The 2026-07-15 audit invalidated only the earlier **begin** claim: those tests
proved each repository call independently, not that accepted message plus turn
opening shared one transaction. The replacement `beginAssistantTurn` operation
now owns conversation resolution, exact request replay, accepted-message write,
and running-turn creation in one transaction. Its four focused container cases
prove simultaneous busy rejection without a losing message, mismatched replay
rejection without mutation, rollback of a newly created conversation after a
message conflict, and rollback when one request id races across conversations.
Aggregate terminal finalization evidence remains valid.

Scope decision: the user dropped the "keep the old app green" constraint (2026-07-11) to avoid a dual-schema coexistence. `packages/db` was reshaped in place for v7; the old app (`partner-ai-service`, `partner-ai-core`) is left non-compiling on purpose and stays only as the Step 08 parity reference until Step 20 deletes it. The v7 wing (db + service) is fully green and container-verified.

Final DDL and id policy: `messages.parts jsonb` (the durable `UIMessage` body, no `content_text`); `assistant_turns` folds usage (`input/output/total/reasoning/cached_input_tokens`), adds `run_id` + provenance (`model_provider/model_id/instructions_version/config_version/content_filter_version`), drops all four lease columns, and enforces the busy guard with the partial unique index `assistant_turns_one_running_per_conversation_uq (conversation_id) WHERE status='running'`; `conversations.legal_hold`. Deleted: the lease/reaper subsystem and the entire in-memory db adapter. **Ids**: `UIMessage.id` is caller-generated and deterministic (the service passes `${turnId}-assistant` / the accepted user id) and is the upsert key; conversation/turn ids keep the repository id generators. The corrected repository terminal boundary is `finalizeAssistantTurn`: one transaction guards the running-to-terminal transition and commits the optional assistant message, usage, conversation timestamp, and identity-only activity notification. ADR 0009 supersedes the earlier separate-claim handoff.

`onEnd` payload source used: the v7 service has no Vercel `onEnd`; the durable Workflow terminal outcome flows to `finalize-turn`, which calls the aggregate finalization boundary once. Safe completed or interrupted assistant output is already a durable-valid `UIMessage`; content-filtered output is excluded. A replay after a committed terminal observes `claimed: false` and does not duplicate history.

Partial-persist invariant evidence: `packages/db` `test:db:container` 13/13 and a service adapter round-trip against real Postgres 6/6 — proving the race-safe busy guard (2nd concurrent begin → `conversation_busy` → `BUSY`), id-keyed idempotent replay of begin/append/claim, the guarded terminal CAS (already-terminal replay is a no-op), cross-subject `FORBIDDEN`, and `assertRunOwned` rejection. drizzle 0.45.2 wraps the driver error in `DrizzleQueryError`, so the unique-constraint name is read from `error.cause`.

Deviations / follow-ups: provenance columns are non-null so the adapter writes placeholders (`modelProvider/modelId: 'pending'`, `*Version: 'v1'`) with a `TODO(step-18)` — `BeginTurnInput` carries no model info. The assistant-message subject id is resolved from a per-turn identity map populated at `beginTurn` (single-instance-correct; durable cross-instance resolution is a later step). Edge case 1 (exact stream-fold `UIMessage` deep-equality) lands with the widget/reads (Steps 10/13); edge case 6 (empty assistant message persistence) is owned by Step 08 — Step 05/06 finalize currently skips empty output.
