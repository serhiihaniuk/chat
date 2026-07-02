# 08 — Host-command result relay (multi-instance)

**Epic:** 1 Streaming | **Priority:** P1 | **Depends on:** 02 | **Status:** done (2026-07-02)

## Delivery notes

- **Durable emit binds command→turn:** the resolver persists an `emitted` row in the existing `host_command_results` table (first production caller of `recordHostCommandResult`) BEFORE the command reaches the browser. That row is what lets ANY instance's result route validate command-belongs-to-turn — the design gap in the story's task 3 ("route validates command-belongs-to-turn" needs durable state a non-owner can see; the `emitted` status in the schema's CHECK constraint was clearly built for this).
- **Relay:** new `HOST_COMMAND_RESULT_NOTIFY_CHANNEL` + parser/source/NOOP modules mirroring the cancel channel; the Postgres `recordHostCommandResult` now runs in a transaction and `pg_notify`s `{assistantTurnId, commandId}` when the write carries a `resolvedAt` (a resolution, not an emit). New `findHostCommandResult` read on the contract + both adapters. Service side: `host-command-result-dispatcher.ts` (listener → read persisted row → `resolveResult`), wired + shut down in composition; notification-source factories extracted to `composition/persistence/notification-sources.ts` (composition file hit its 300-line budget).
- **Resolver rework:** pending map keyed `(assistantTurnId, commandId)` — a leaked commandId can never settle through a different turn (`resolveResult` takes both ids); while awaiting, the owner polls the persisted result every 2 s (the missed-NOTIFY backstop, same belt-and-braces as the subscription safety poll). Fast path kept: a result POSTed to the owner settles synchronously via `resolveResult` before any relay latency.
- **Route rework:** moved to `turns/host-commands/chat-turn-host-commands.ts` (the turns dir was at its 5-file cap): validate turn → validate `emitted` row (404 otherwise) → persist resolution (browser status constrained to the durable vocabulary, never `emitted`; off-vocabulary → `failed`) + NOTIFY in-transaction → local fast-path settle → `{settled: true}`. Reposting is an idempotent upsert.
- **Tests:** resolver suite rewritten (emitted-row persistence; cross-turn settle rejected with honest timeout; **two resolvers over one shared memory store: a result recorded "by the other instance" settles the owner via the poll** — the multi-instance case without Docker); new route tests (persist+settled, never-emitted 404, leaked-commandId-other-turn 404 + original row untouched, off-vocabulary status→failed). The pg NOTIFY listener path needs one `test:db:container` run — Docker still unavailable (same caveat as plan/05; the pending container-test chip covers the environment).
- **Docs:** ADR 0009 marked implemented + decision §3 rewritten to the emitted-row design; host-commands.md round-trip steps + failure table updated to shipped behavior; OpenAPI gained the (previously undocumented) result route.
- **Note:** `commandRedactedJson` stores the model's command payload as-is — the same payload already streamed to the browser; actual redaction is `plan/20`/`plan/24` territory.

## Problem

A model-called host command pauses the tool loop on an in-memory promise map on the owning instance (`apps/partner-ai-service/src/adapters/host-commands/service-host-command-resolver.ts:29,59-77`, 30 s timeout). The browser posts the result to `POST /chat/turns/:id/host-commands/:commandId/result` (`chat-turns.ts:146-176`) — a separate HTTP request that 404s on any non-owner instance. With stream-from-POST (story 02) the _stream_ is owner-attached, but this result POST still round-robins.

Secondary issue (single-instance too): the route authorizes the turn id against the caller's workspace but settles by **global commandId alone** — any authenticated caller with any valid turn in their own workspace plus a leaked commandId can settle another workspace's pending command. And subject-scoping is absent (story 20 handles subject scoping broadly).

## Decided approach

Recorded as **ADR 0009** (`docs/adr/0009-host-command-await-and-result-relay.md`); the detailed mechanics and failure-mode table live in `docs/architecture/host-commands.md` ("The mid-stream result round trip") — update both if implementation deviates.

Relay results the same way cancel already works cross-instance (durable intent + small NOTIFY poke — the pattern and channel infra exist in `packages/db/src/repositories/postgres-drizzle/notifications/` and `records/turns.ts:33-56`):

1. New channel `sidechat_host_command_result` (follow the cancel channel's naming/shape). Payload: `{ assistantTurnId, commandId }` — poke, not data (well under the 8 KB limit; matches house style).
2. The result route (any instance): validate turn ownership AND that `commandId` belongs to that turn, persist the result durably (new small table or a column on an existing host-command record — check what P2/P3a commits persist already; ADR-0002 "host command result durability" exists — align with it), then `pg_notify` in the same transaction.
3. The owning instance's listener resolves the pending promise by reading the persisted result. If the result arrives locally (single instance/dev), resolve directly and skip the round-trip — keep the fast path.
4. Bind settle to the turn: the resolver map key becomes `(assistantTurnId, commandId)`; reject mismatches.
5. **Poll fallback on the awaiting side:** while a pending entry awaits, the owner polls the persisted result at a low frequency (~2 s), so a dropped/deaf LISTEN connection costs seconds of latency instead of the 30 s timeout — same belt-and-braces shape as the turn-subscription safety poll. Correctness never depends on NOTIFY delivery (ADR 0009).
6. In-memory persistence profile: NOOP notification source is fine (single process — local resolve path covers it), same as cancel.

## Tasks

1. Read `service-host-command-resolver.ts` and the cancel relay end-to-end (`records/turns.ts:25-56`, `turn-cancel-notification-source.ts`, `turn-cancel-dispatcher.ts`). **The durable target already exists:** the `host_command_results` table (`packages/db/src/drizzle/schema.ts:220-242`) ships with the exact `(assistant_turn_id, command_id)` unique index this story needs, plus the repo method `recordHostCommandResult` (`schema-contract/repositories.ts:384`) — currently zero production callers. Use it; do not create a new table. Rows are one small row per command, kept forever (no retention anywhere by design — plan/10 capacity note).
2. Persist results durably; add the NOTIFY emit in-transaction; add the LISTEN source + dispatcher wired in `service-composition.ts` (reuse the scoped-stream shape; error handlers per story 26).
3. Rework the resolver keying to `(turn, command)`; route validates command-belongs-to-turn.
4. Tests: result posted to a non-owner stub still resolves the owner's pending promise (two composition instances over one memory/pg fixture — the db container lane can host the pg case); mismatched commandId→turn rejected; timeout path unchanged.

## Acceptance criteria

- [ ] Host-command round-trip works when the result POST lands on a different composition instance (pg-backed integration test).
- [ ] A commandId cannot be settled through a different turn (unit test).
- [ ] Local single-instance path has no added latency (fast path kept).

## Verification

```sh
npm test -- host-command
npm run test:db:container
npm run verify
```
