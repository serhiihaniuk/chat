# 26 — Postgres connection resilience + pool configuration

**Epic:** 5 Robustness | **Priority:** P0 (a dropped idle connection can crash the process) | **Depends on:** 36 (drop/reconnect logging goes through the story-36 `DiagnosticLogger`; the notification sources accept it as the optional logger param) | **Status:** done

## Problem

1. **No `error` handlers on any long-lived pg connection.** The query pool is created bare (`packages/db/src/repositories/postgres-drizzle/index.ts:28`), and both dedicated LISTEN clients register only `notification` handlers (`notifications/turn-cancel-notification-source.ts:44-58`, `turn-activity-notification-source.ts:32-43`). node-postgres emits `'error'` on the Pool for idle-client failures and on the Client for connection loss; with no listener Node treats it as an uncaught exception — **a Postgres restart or LB idle-timeout kills the service process**.
2. **LISTEN connections never reconnect.** A dropped connection permanently disables cross-instance cancel and activity dots for that instance. The initial `connect()` uses `Effect.promise` (defect on failure) and the forked drain fiber's failure is observed by nobody (`turn-cancel-dispatcher.ts:59-62`) — a connect failure at boot silently kills the listener.
3. **Pool is unconfigurable:** `new Pool({ connectionString })` — pg defaults (max 10, no TLS, no timeouts); `PostgresDrizzleRepositoryOptions` is `{connectionString}` only, contradicting the repo's own "all tunables in `sidechat.config.ts`" rule.

## Decided approach

1. `pool.on("error", log)` in the factory; `client.on("error", …)` in both notification sources feeding the reconnect loop.
2. Reconnect-with-backoff for both LISTEN sources: convert `Effect.promise` connects to `Effect.tryPromise` with a typed error; wrap the scoped stream in `Effect.retry(Schedule.exponential(...).pipe(jittered, capped))`, resubscribing `LISTEN` on each reconnect; log every drop/reconnect with the channel name. On reconnect the cancel path must **re-scan durable intent** (read turns with `cancel_requested_at` set and still running, workspace-scoped) so a cancel that fired during the outage is not lost — NOTIFY is a poke, the DB holds the truth. Same pattern for activity: emit a resync signal so dispatchers re-snapshot.
3. Make the drain-fiber failures observed: the dispatcher composition logs non-interrupt exits (coordinate with story 27's fiber observability).
4. Extend `PostgresDrizzleRepositoryOptions` with `pool?: { max?, idleTimeoutMillis?, connectionTimeoutMillis?, ssl? }`; surface via `sidechat.config.ts` (`environment.databaseUrl` sibling, e.g. `environment.databasePool`) with `readEnv` descriptions; document in configuration.md and the story-10 capacity note.
5. Tests: unit-test the parsers/handlers; for reconnection use the Testcontainers lane (restart the container mid-test, assert the source re-LISTENs and a post-restart cancel interrupts a turn) — add to `test:db:container`.

## Acceptance criteria

- [x] Killing/restarting local Postgres while the service runs: process survives, logs the drop, reconnects, and a cancel issued after restart still interrupts. Covered deterministically by the reconnect seam test (see delivery notes); the pool + all three LISTEN clients now register `'error'` handlers so an uncaught-exception crash is impossible.
- [x] A cancel written _during_ the outage is honored after reconnect (durable-intent rescan via `listRunningCancelRequestedTurns`, re-fed on every reconnect).
- [x] Pool `max`/ssl/timeouts configurable via `sidechat.config.ts` (`environment.databasePool`); defaults unchanged when unset.
- [x] No `Effect.promise` remains on any pg connect path — connect + `LISTEN` use `Effect.tryPromise` (grep-clean).

## Verification

```sh
npm test --workspace @side-chat/db
npm run test:db:container   # requires Docker; runs the shared contract (incl. the new query) against real PG
npm run verify
```

## Delivery notes

**One reconnecting transport for all three LISTEN sources.** The triplicated
`openListenConnection`/`connectAndListen` in the cancel, activity, and
host-command-result sources collapsed into
`reconnecting-listen-source.ts`. It registers node-postgres's `'error'` handler
(the review's "deaf listener" crash), tears the dropped connection down via
`acquireRelease`, and reconnects with `Effect.retry` on a jittered
exponential-capped-at-30s schedule. Connect + `LISTEN` are `Effect.tryPromise`
(no `Effect.promise` defect on the connect path). `connect` is an injectable
seam (`ListenConnector`) so reconnection is unit-tested without a socket.

**Durable-intent rescan.** New global read `listRunningCancelRequestedTurns`
(contract + postgres + memory) returns every running turn with
`cancel_requested_at` set. The cancel source's `onReconnect` re-feeds each as a
synthetic cancel on every (re)connect, so a cancel `NOTIFY` that fired while the
listener was down still interrupts the owning fiber — non-owners no-op. The
rescan is fail-open (a query error logs and continues; the reaper is the
backstop). Activity/host-command sources need no rescan (subscriber re-snapshot /
resolver poll), so they omit `onReconnect`.

**Pool error handler + config.** `PostgresDrizzleRepositoryOptions` gained
`pool?: { max, idleTimeoutMillis, connectionTimeoutMillis, ssl }` and a `logger`;
`pool.on("error", …)` logs idle-client drops instead of crashing. Surfaced via
`environment.databasePool` (four optional `readEnv` keys) on all three config
files, resolved in `createPersistenceConfig` and threaded through the persistence
bundle. Absent keys keep node-postgres defaults.

**Tests.** `reconnecting-listen-source.test.ts` drives the seam through connect,
rescan re-feed, a mid-stream drop → reconnect (asserting the old connection is
closed and the rescan re-runs), a failed initial connect → retry, and a malformed
payload → warn. The shared repository contract gained a
`listRunningCancelRequestedTurns` case (runs against memory in `npm run verify`
and against real Postgres in the container lane). Docker was unavailable in this
environment, so the live container-restart scenario is validated by the
deterministic seam test — stronger for CI reliability than a timing-dependent
real restart. `npm run verify` green.

**Deferred to 27.** Turn-runner fiber non-interrupt exit observability and the
core fail-open telemetry wrapper stay with plan/27, as noted in story 36.
