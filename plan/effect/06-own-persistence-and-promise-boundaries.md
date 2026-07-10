# Step 06: Own Persistence Resources and Promise Boundaries

Read this when: centralizing database adapters, separating resource ownership, or repairing PostgreSQL lifecycle behavior.

Source of truth for: the Effect-facing persistence services, Promise conversion policy, and app-owned versus caller-owned release rules.

Not source of truth for: database schema or repository semantics. Those remain owned by `packages/db` and its canonical documentation.

Status: `not_started`

Owner: unassigned

Depends on: Step 05

Unblocks: Steps 07-16

## Outcome

Record repository contracts remain Promise-based, while the service provides typed Effect adapters. `packages/db` keeps Effect for its scoped notification Streams and reconnect scheduling instead of rebuilding those capabilities by hand. Pre-start durable writes become one atomic `beginTurn` transaction, internally constructed PostgreSQL resources are scoped, and injected repositories are never closed by the application.

## Current evidence to verify

- `packages/db/src/repositories/contract.ts` owns Promise repository contracts.
- `create-service-persistence-bundle.ts` selects in-memory, PostgreSQL, or injected repositories.
- PostgreSQL repository construction exposes a close/release operation.
- the current persistence bundle loses whether the application or caller owns that release;
- current service shutdown does not reliably close internally created PostgreSQL resources.

The resource leak is a target-state regression test. Prove its current behavior before changing acquisition.

## Target services

Derive cohesive services from workflow invariants instead of entity files or the entire `SidechatRepositories` object. The target includes a transaction-oriented `TurnPreparationStore.beginTurn` operation plus separate conversation queries, assistant-turn finalization/control, turn lease, event log, usage/history, and notification capabilities.

`beginTurn` receives the already authorized/admitted/prepared inputs and atomically ensures or creates the conversation, appends the user interaction, creates the running turn, stores the prepared context snapshot, and establishes any initial fencing/lease state required by the workflow. Busy/idempotency checks that must be race-safe occur inside the same database transaction. No schema change is implied.

Each adapter method uses the selected version's typed Promise constructor, catches only the repository Promise rejection, and maps it to the Step 04 error owned by that service operation. The adapter must not retry, log raw errors, or reinterpret idempotency. Higher-level policy owns those decisions.

## Ownership paths

### Application-owned Live path

1. Read validated persistence settings.
2. Acquire the PostgreSQL repository/pool and notification connections in a scoped Effect.
3. Register release immediately after acquisition.
4. Adapt repository capabilities into Effect services.
5. Release exactly once when the application scope closes, including partial Layer acquisition failure.

The in-memory Live/demo path should also be a Layer, even if release is a no-op, so composition does not branch into a separate architecture.

### Caller-owned injected path

1. Receive an already constructed repository bundle from an explicit test/embed option.
2. Adapt it into the same service tags with `Layer.succeed` or equivalent.
3. Do not call its close/release method when the application stops.
4. Document that the caller retains lifecycle responsibility.

Do not store an `owned: boolean` next to a universal shutdown callback if separate constructors/Layers can encode ownership structurally.

## Implementation sequence

1. Add lifecycle and atomicity regression tests before editing:
   - internally created PostgreSQL resource closes on application shutdown;
   - later Layer acquisition failure closes an already acquired pool;
   - injected repository is not closed;
   - repeated application disposal does not double-close;
   - notification connections stop before the pool closes;
   - failure at each pre-start write leaves no partial conversation/message/turn/lease/context/event residue;
   - duplicate/idempotent `beginTurn` cannot create two active turns.
2. Inventory every repository call and transaction invariant. Group services by atomic/recovery ownership, not repository file family.
3. Implement the final Step 05 service interfaces/tags. If current repository grouping does not match those contracts, adapt it here rather than moving or duplicating core tags.
4. Build one adapter module per cohesive repository service. Centralize Promise conversion and error mapping there.
5. Implement the same `beginTurn` atomic contract for PostgreSQL and in-memory repositories so conformance tests remain meaningful. Use a real Drizzle transaction for PostgreSQL.
6. Build separate app-owned PostgreSQL, in-memory, and caller-owned injected Layers that provide the same service set.
7. Convert current composition and tests to consume those Layers while keeping exactly one persistence path active.
8. Persistence owns the pool/client factory and a typed scoped notification Stream/source. The Step 09 dispatcher subscription owns the actual LISTEN connection and fiber, so listener clients close before the underlying pool.
9. Remove duplicated wrappers, repository pass-through bundles, and shutdown plumbing whose only purpose was manual ownership.
10. Keep record repository exports Promise-based. Keep notification Effect imports confined to the scoped notification/reconnect modules and document that intentional exception. Fix repository contract gaps with db conformance tests.

## Likely affected areas

- `packages/db/src/repositories/contract.ts` for inspection, not automatic redesign
- `packages/db/src/repositories/postgres-drizzle/index.ts`
- `packages/db/src/repositories/notifications/**`
- `apps/partner-ai-service/src/adapters/persistence/**`
- `apps/partner-ai-service/src/composition/persistence/**`
- `apps/partner-ai-service/src/composition/service-composition.ts`
- persistence/resource tests under service and db

No database migration or schema change belongs in this step unless a separately approved repository semantic change proves it necessary.

## Contract tests

- every repository family passes the same core service contract against memory and PostgreSQL adapters where practical;
- `beginTurn` is atomic under injected failures and concurrent duplicate starts;
- a rejected Promise becomes the correct tagged error with private cause;
- no raw driver message reaches protocol/telemetry;
- release order and exactly-once behavior pass with resource probes;
- app-owned and caller-owned paths have opposite close expectations;
- exactly one connection per configured LISTEN channel is acquired by an active subscription and all listener clients close before `pool.end`;
- partial construction does not leak earlier resources.

Use the disposable database command for PostgreSQL integration. Do not use a developer's persistent database.

## Verification

```powershell
npm test -- apps/partner-ai-service/src/composition/service-composition.persistence.test.ts
npm test -- packages/db/src/repositories
npm run test:db:container
npm run typecheck
npm run lint:custom
```

If container execution is unavailable, record the exact blocker and keep the step `in_review`, not `complete`, unless equivalent disposable PostgreSQL evidence is produced.

## Completion checklist

- [ ] Repository Promise conversion occurs once per cohesive adapter operation.
- [ ] `TurnPreparationStore.beginTurn` atomically owns every pre-start durable write and passes failure/duplicate conformance tests.
- [ ] App-owned PostgreSQL resources are acquired/released by scope.
- [ ] Injected repositories remain caller-owned and are never closed by the app.
- [ ] Partial acquisition and repeated disposal tests pass.
- [ ] Notification connection ownership is explicit.
- [ ] Record repository contracts remain Promise-based; notification Stream/reconnect Effect usage stays scoped and documented.
- [ ] Replaced persistence bundles/manual shutdown code are deleted.
- [ ] Memory, disposable PostgreSQL, typecheck, and governance tests pass.
- [ ] `STATUS.md` records lifecycle evidence and any blocked external integration.

## Handoff record

Final persistence service tags: pending

App-owned Layer entry point: pending

Caller-owned Layer entry point: pending

Release-order evidence: pending

Verification: pending
