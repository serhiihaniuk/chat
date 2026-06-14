# 5. Postgres Persistence Path

## Goal

Fix and verify the real Postgres-backed service path so conversation history,
context snapshots, and future memory writes survive service restart.

## Why Fifth

Conversation history can start with in-memory tests, but durable memory should
not be built on an unverified persistence path. Fix this before implementing
real memory storage.

## Ownership

| Concern                         | Owner                                                                  |
| ------------------------------- | ---------------------------------------------------------------------- |
| Schema and repository contracts | `packages/db`                                                          |
| Postgres Drizzle repositories   | `packages/db/src/repositories/postgres-drizzle/**`                     |
| Service DB wiring               | `apps/partner-ai-service/src/composition` and config                   |
| Public history route            | `apps/partner-ai-service/src/inbound/http/routes/chat/chat-history.ts` |
| Persistent E2E                  | `test-harness/widget-harness/e2e/persistent.spec.ts`                   |

Do not bypass repository contracts from routes or product core to fix insert
errors.

## Implementation Steps

1. Reproduce the Postgres insert failure.

   Capture the command, environment shape without secrets, migration state,
   failing table/column, repository method, and stack trace.

2. Compare schema contract, Drizzle schema, and migrations.

   Fix the smallest mismatch in `packages/db` unless evidence points to service
   config wiring.

3. Extend repository contract tests.

   Cover user messages, assistant turns, context snapshots, usage records,
   history ordering, authorization, and reset behavior.

4. Run service with Postgres enabled.

   Verify user message insert, assistant turn insert, terminal state update,
   history read, reset, and context snapshot persistence.

5. Verify restart behavior.

   Create a conversation, stop and restart the service, then read history through
   the public route.

6. Report the active persistence adapter through diagnostics.

   This closes the gap where a real-model run can accidentally prove only the
   in-memory path.

## Persistence Invariants

```txt
[ ] User turn insert and assistant turn insert are durable.
[ ] Assistant terminal update is durable.
[ ] Context snapshot persistence uses the same request/turn identifiers as runtime execution.
[ ] History endpoint returns persisted messages after service restart.
[ ] In-memory repositories remain available for local/dev tests only when selected explicitly.
```

## Tests

```txt
[ ] Postgres repository contract passes
[ ] service app can stream a turn with Postgres enabled
[ ] history endpoint returns persisted messages
[ ] reset prevents old messages from appearing after reset
[ ] context snapshot persists on the same DB path
[ ] persisted history survives service restart
[ ] production-like database config does not silently fall back to memory repositories
```

## Exit Criteria

```txt
[ ] Real-model service can run with Postgres enabled.
[ ] User and assistant turns persist without insert errors.
[ ] History endpoint returns persisted messages after restart.
[ ] Context snapshot persistence works on the same path.
[ ] Diagnostics expose active persistence adapter without secrets.
[ ] In-memory fallback is not mistaken for durable persistence.
```
