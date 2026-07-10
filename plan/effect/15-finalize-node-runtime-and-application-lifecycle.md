# Step 15: Finalize Node Runtime and the Application Lifecycle

Read this when: finalizing the executable, readiness, fatal propagation, run boundaries, and ordered process shutdown after Step 08's application cutover.

Source of truth for: the final NodeRuntime topology, approved boundary adapters, application handle, readiness, and ordered shutdown.

Not source of truth for: internal service implementations, which must already be complete in prior steps.

Status: `not_started`

Owner: unassigned

Depends on: Step 14

Unblocks: Step 16

## Outcome

Step 08's single ManagedRuntime/Hono adapter becomes the only application execution environment. The Node executable uses `NodeRuntime.runMain`, forces the ManagedRuntime's lazy Layer acquisition before opening a port, races server lifetime with the root fatal signal, and disposes the ManagedRuntime exactly once. An explicit lifecycle coordinator performs ordered bounded shutdown before Layer finalizers act as safety nets.

## Final run boundaries

Allowed production Effect execution boundaries:

1. `NodeRuntime.runMain` in the Node executable;
2. the single `ManagedRuntime` adapter used by Hono Promise/stream callbacks;
3. the AI SDK tool Promise/AbortSignal adapter required by the third-party callback contract.

Core workflows, service constructors, background owners, persistence adapters, and observability helpers must not call `Effect.runSync`, `runPromise`, `runFork`, or create/close manual scopes.

## Application handle

Expose the smallest boundary handle required by embedding/tests. It may contain:

- Hono app/fetch handler;
- readiness information as a safe boundary operation;
- an idempotent `dispose` only if the boundary consumer cannot own the Effect scope directly.

It must not expose the full Context, internal services, mutable composition bundles, or multiple shutdown functions. Prefer a scoped `makeApplication` Effect and let the executable own its scope. If an imperative handle is required for Hono tests, it wraps one ManagedRuntime and makes ownership explicit.

Delete `createPartnerAiServiceApp` if Step 08 did not already remove it. Migrate tests to the managed/scoped harness. Do not retain it as a deprecated alias.

## Single-acquisition topology

1. Create exactly one `ManagedRuntime` from `ApplicationLive` for each application handle.
2. Force its context/acquisition with the selected-version readiness operation before starting the Node server. On beta.70 the audit identified `contextEffect`; Step 01 records the selected equivalent.
3. Never also `Effect.provide(ApplicationLive)` to the Node main Effect and never `Layer.launch` the same graph. NodeRuntime owns the process Effect, not a second application Layer instance.
4. Start the Node/Hono server as a separate scoped boundary resource using the fetch handler backed by that ManagedRuntime.
5. Race server lifetime with OS interruption and the `BackgroundSupervisor` fatal signal.
6. Run the lifecycle coordinator, close the Node server, then dispose the ManagedRuntime exactly once.

Acquisition probes for database, notification subscriptions, registries, semaphores, and exporters must each equal one per app instance.

## Hono boundary adapter

Create one adapter that:

- runs request Effects through the application ManagedRuntime;
- converts pre-stream typed failures through the exhaustive mapper;
- converts Effect Stream/async event output to the current SSE `ReadableStream` boundary once;
- binds pre-admission request abort to request Effect interruption;
- treats start-response disconnect after admission as response cleanup only; generation remains server-owned;
- treats resumed-SSE cancel as interruption of the durable protocol replay/live subscription only, never the provider generation Stream;
- does not leak Effect errors/types into Hono route DTOs or `chat-protocol`.

Route modules should compose Effects and return boundary values; they should not each invent a different `runPromise`/abort mapping.

## Startup and readiness

The main Effect should:

1. load and validate configuration;
2. force the single ManagedRuntime context so application Layer/resources and mandatory startup checks actually acquire;
3. verify mandatory background services are ready;
4. start the Hono/Node server;
5. advertise readiness only after steps 1-4;
6. remain alive until signal/fatal service failure;
7. run the lifecycle coordinator and dispose the ManagedRuntime once.

Startup failure must release partial resources and emit a safe fatal diagnostic. It must not start HTTP in a partly wired state.

## Shutdown sequence

Prove this semantic order with probes and bounded TestClock control:

1. stop accepting new HTTP requests;
2. stop admission and drain admitted work within the configured budget;
3. interrupt remaining active turn fibers and allow terminal finalizers;
4. stop reaper and notification listeners;
5. close event fan-out and host-command resolver state;
6. flush telemetry exporters within a bounded interval;
7. close PostgreSQL/listener resources.

Implement an `ApplicationLifecycle` coordinator Layer built last and finalized first. Its explicit Effect stops admission/server intake, drains to hard deadlines, interrupts active work, waits for a bounded terminalization attempt while persistence is open, stops consumers, closes blocked SSE sockets, flushes final telemetry, then allows dependency finalizers to release exporters and database resources. A timeout at any stage advances to the next cleanup stage and is recorded; shutdown cannot hang.

## Implementation sequence

1. Inventory every production `Effect.run*`, `Scope.make/close`, `ManagedRuntime`, app factory, and explicit shutdown callback.
2. Verify Step 08's one ManagedRuntime/Hono adapter and remove any remaining alternative runtime owner.
3. Force ManagedRuntime acquisition before server start and fail boot without opening a port if acquisition/readiness fails.
4. Ensure the AI SDK Promise adapter runs tool Effects on the application/captured runtime environment, links the tool span, propagates AbortSignal to interruption, runs scoped finalizers, and never creates a default or nested runtime.
5. Replace any remaining test app constructors with the scoped managed application harness.
6. Rebuild `server.ts`/`index.ts` around selected-version `NodeRuntime.runMain`, the single-acquisition topology, and fatal-supervisor race.
7. Implement readiness and fatal background propagation.
8. Implement the sequential `ApplicationLifecycle` coordinator with per-stage hard deadlines and idempotent repeated signal/dispose behavior.
9. Add `scripts/test-fake-service-lifecycle.mjs` plus `npm run test:service:lifecycle`. It starts fake configuration on an ephemeral port, starts a turn, observes durable stream behavior, exercises explicit cancel, shuts down, asserts release order and the selected exit contract, and terminates itself.
10. Delete unsafe constructors, manual composition handles, nested runtimes, and shutdown arrays.
11. Update `docs/architecture/system-map.md`, `assistant-turn.md`, and operations verification docs with the implemented root, interruption domains, readiness, and shutdown lifecycle.
12. Run the complete lifecycle, streaming, resource, and self-terminating smoke suites.

## Contract tests

- app start acquires shared resources once and reaches readiness only after mandatory services;
- boot failure after partial acquisition releases all prior resources and never serves HTTP;
- two test application handles are isolated;
- pre-admission request abort interrupts request work;
- start-response and resumed-SSE disconnect do not interrupt server-owned generation;
- a typed pre-stream error maps once to HTTP;
- a post-start error emits one terminal event;
- one shutdown coordinator stops admission, drains/interrupts, attempts terminal persistence while DB is open, closes subscriptions, flushes telemetry, then releases in exact required order;
- repeated dispose/signal is safe and does not double-finalize;
- shutdown with blocked provider/host wait completes within configured budget;
- internally owned PostgreSQL closes, injected persistence does not;
- no work/listener/queue remains active after disposal;
- ManagedRuntime acquisition failure never opens the server port;
- one app instance acquires every `ApplicationLive` resource exactly once;
- the executable follows the selected-version signal exit contract and exits nonzero on fatal boot failure. Beta.70's default interruption code was 130; do not assert zero unless a custom teardown is deliberately implemented and documented.

## Verification

```powershell
rg -n 'Effect\.run(Sync|Promise|Fork)|Scope\.(make|close)|ManagedRuntime|createPartnerAiServiceApp|shutdown:' apps/partner-ai-service packages/partner-ai-core packages/agent-runtime
npm test -- apps/partner-ai-service/src/inbound/http
npm test -- apps/partner-ai-service/src/composition
npm test -- apps/partner-ai-service/src/inbound/turn-runner
npm run typecheck
npm run build
npm run lint:custom
npm run test:service:lifecycle
```

The self-terminating lifecycle command is the disposable fake-provider smoke. It must use no real credentials and record the selected signal/clean exit contract plus release trace.

## Completion checklist

- [ ] Exactly one `ApplicationLive` acquisition and ManagedRuntime owner exist per app instance.
- [ ] Hono uses one runtime/stream/abort boundary adapter.
- [ ] Node executable uses selected-version `NodeRuntime.runMain`.
- [ ] ManagedRuntime acquisition is forced before the server port opens and readiness follows mandatory acquisition.
- [ ] AI SDK tool callbacks use the captured application runtime, interruption, finalizers, and trace context.
- [ ] Ordered hard-deadline shutdown passes probe tests and `npm run test:service:lifecycle`.
- [ ] Unsafe app constructor and manual composition/shutdown handles are deleted.
- [ ] Production Effect run calls exist only at the three approved boundary categories.
- [ ] Lifecycle, streaming, type, build, and governance checks pass.
- [ ] `STATUS.md` records run-boundary search and smoke evidence.

## Handoff record

Application Layer/runtime entry point: pending

Hono boundary adapter entry point: pending

Executable main entry point: pending

Shutdown trace: pending

Smoke verification: pending
