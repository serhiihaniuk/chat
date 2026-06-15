# Postgres Persistence Path Plan

## 1. Goal

Fix and verify the real Postgres-backed service path so conversation history,
context snapshots, and future memory writes can survive service restart.

This plan covers audit gap `4.8`.

## 2. Current gap

The real-model local run proved provider integration, but the Postgres path
failed on insert. The service was then run with `SIDECHAT_DATABASE_URL` cleared,
which used the in-memory repository path.

That means the model call was real, but durable persistence was not proven.

## 3. Ownership

| Concern                            | Owner                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------- |
| DB schema and repository contracts | `packages/db`                                                          |
| Postgres Drizzle repository        | `packages/db/src/repositories/postgres-drizzle/**`                     |
| Service DB wiring                  | `apps/partner-ai-service/src/composition` and config                   |
| HTTP history route                 | `apps/partner-ai-service/src/inbound/http/routes/chat/chat-history.ts` |
| Persistent E2E                     | `test-harness/widget-harness/e2e/persistent.spec.ts`                   |

Do not bypass repositories from product core or routes just to fix a local insert
error.

## 4. Implementation sequence

1. Reproduce the insert failure.

   Capture:

   ```txt
   exact command
   env shape without secrets
   migration state
   failing SQL/table/column
   expected repository method
   stack trace
   ```

2. Compare schema contract to Drizzle schema.

   Check:

   ```txt
   packages/db/src/schema-contract/**
   packages/db/src/repositories/postgres-drizzle/**
   migrations or generated SQL, if present
   ```

3. Fix schema, migration, or adapter mismatch.

   Keep the fix in `packages/db` unless the bug is clearly service config
   wiring. Do not change public `sidechat.v1` protocol to accommodate DB shape.

4. Add or update repository contract tests.

   The shared repository contract should cover user/assistant messages, context
   snapshots, usage, tool/host records, history ordering, authorization, and
   reset behavior.

5. Run the service with Postgres enabled.

   Verify:

   ```txt
   user message insert
   assistant turn insert
   terminal state update
   history endpoint read
   reset endpoint behavior
   context snapshot persistence
   ```

6. Verify restart behavior.

   Start the service, create a conversation, stop/restart, then read the same
   history through the public route.

7. Extend persistent E2E only after the lower layers pass.

   Browser E2E should prove the integration story, not diagnose schema bugs.

## 5. Tests

Required scenarios:

```txt
[ ] Postgres repository contract passes
[ ] service app can stream a turn with Postgres enabled
[ ] history endpoint returns persisted messages
[ ] reset prevents old messages from appearing after reset
[ ] context snapshot persists on the same DB path
[ ] persisted history survives service restart
```

Likely commands:

```txt
npm run test:db:container
npm test -- --run apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
npm run test:e2e:persistent
```

Only run provider smoke with real credentials when explicitly needed for the
provider path; DB persistence should be verifiable with deterministic runtime
fixtures.

## 6. Documentation updates

Update:

```txt
docs/operations/verification.md, only if persistent commands or setup change
apps/partner-ai-service/README.md
side-chat-current-iteration-docs-and-architecture-fix-plan/07-acceptance-criteria.md
```

Do not record secrets, real database URLs, or provider keys in docs or fixtures.

## 7. Acceptance criteria

```txt
[ ] Real-model service can run with Postgres enabled.
[ ] User and assistant turns persist without insert errors.
[ ] History endpoint returns persisted messages after restart.
[ ] Context snapshot persistence works on the same path.
[ ] The in-memory fallback is not mistaken for durable persistence.
```
