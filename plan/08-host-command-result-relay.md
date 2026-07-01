# 08 — Host-command result relay (multi-instance)

**Epic:** 1 Streaming | **Priority:** P1 | **Depends on:** 02 | **Status:** todo

## Problem

A model-called host command pauses the tool loop on an in-memory promise map on the owning instance (`apps/partner-ai-service/src/adapters/host-commands/service-host-command-resolver.ts:29,59-77`, 30 s timeout). The browser posts the result to `POST /chat/turns/:id/host-commands/:commandId/result` (`chat-turns.ts:146-176`) — a separate HTTP request that 404s on any non-owner instance. With stream-from-POST (story 02) the *stream* is owner-attached, but this result POST still round-robins.

Secondary issue (single-instance too): the route authorizes the turn id against the caller's workspace but settles by **global commandId alone** — any authenticated caller with any valid turn in their own workspace plus a leaked commandId can settle another workspace's pending command. And subject-scoping is absent (story 20 handles subject scoping broadly).

## Decided approach

Relay results the same way cancel already works cross-instance (durable intent + small NOTIFY poke — the pattern and channel infra exist in `packages/db/src/repositories/postgres-drizzle/notifications/` and `records/turns.ts:33-56`):

1. New channel `sidechat_host_command_result` (follow the cancel channel's naming/shape). Payload: `{ assistantTurnId, commandId }` — poke, not data (well under the 8 KB limit; matches house style).
2. The result route (any instance): validate turn ownership AND that `commandId` belongs to that turn, persist the result durably (new small table or a column on an existing host-command record — check what P2/P3a commits persist already; ADR-0001 "host command result durability" exists — align with it), then `pg_notify` in the same transaction.
3. The owning instance's listener resolves the pending promise by reading the persisted result. If the result arrives locally (single instance/dev), resolve directly and skip the round-trip — keep the fast path.
4. Bind settle to the turn: the resolver map key becomes `(assistantTurnId, commandId)`; reject mismatches.
5. In-memory persistence profile: NOOP notification source is fine (single process — local resolve path covers it), same as cancel.

## Tasks

1. Read `service-host-command-resolver.ts`, the cancel relay end-to-end (`records/turns.ts:25-56`, `turn-cancel-notification-source.ts`, `turn-cancel-dispatcher.ts`), and ADR-0001.
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
