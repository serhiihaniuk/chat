# Step 09: Scope and Supervise Background Services

Read this when: rebuilding turn runners, reapers, notification listeners, dispatchers, or any long-lived fiber.

Source of truth for: background ownership, startup, supervision, failure policy, and scoped shutdown.

Not source of truth for: host-command resolution details, retry schedules, or final executable shutdown; those are refined in Steps 10, 11, and 15.

Status: `not_started`

Owner: unassigned

Depends on: approved architecture checkpoint after Step 08

Unblocks: Steps 10-16

## Outcome

Every background process is a scoped service in the application Layer. Active turns, reaper schedules, database notification listeners, cancel/activity/result dispatchers, and event registries are supervised, observable, interruptible, and released automatically. No constructor manually creates a Scope or returns an ad hoc shutdown callback.

## Current owners to verify

- turn runner and its active-generation `FiberMap`;
- stale-turn reaper;
- cancel notification dispatcher;
- activity notification dispatcher;
- host-command result dispatcher;
- event subscription/live dispatch registry;
- database reconnecting LISTEN sources.

Current modules use manual `Scope.make`, `forkIn`, `runSync`, `runPromise`, or explicit `shutdown` in several of these areas. Re-run the search after Step 08 because paths may change.

## Service lifecycle model

Each long-lived service should be constructed as a scoped Layer that:

1. acquires its queues/maps/listener/resource;
2. starts owned fibers inside the Layer/application scope;
3. reports readiness only after required startup succeeds;
4. classifies runtime failures according to an explicit policy;
5. interrupts work and releases sources when scope closes;
6. exposes Effect operations, not Promise methods and shutdown callbacks.

Use `FiberMap` for active turns keyed by durable turn identity. Use `FiberSet` for independent listener fibers where keys add no policy value. A permanent `BackgroundSupervisor` service observes every child Exit: recoverable tags restart under policy, degraded outcomes update readiness, and fatal outcomes complete a root fatal Deferred that the server lifetime races. Storing a fiber is not sufficient supervision.

## Failure policies

### Turn runner

An admitted turn is owned until one terminal state is persisted. Duplicate keys must not create two generators. Completion, failure, cancellation, lease loss, and shutdown all remove registry state and execute terminal finalization once.

### Reaper

A transient sweep failure is recorded and the schedule continues. A configuration/defect failure is not swallowed. The service must not fork a new overlapping sweep while the prior sweep is still running unless overlap is an explicit tested policy.

### Notification listeners

Classified transient connection/source failures may reconnect under Step 11's capped jitter schedule. Permanent authentication/schema/configuration failures fail readiness or the root runtime according to the recorded policy. Readiness means each mandatory LISTEN subscription has acknowledged successful setup, not merely that a reconnect loop was forked.

### Dispatchers

Malformed/unowned notifications are rejected safely and observed without logging payloads. Handler failure policy must distinguish one bad notification from source failure. Shutdown stops receiving new notifications before closing downstream registries.

## Implementation sequence

1. Add the background ownership table to this file's handoff record: service, resource, fiber type/key, start condition, readiness rule, recoverable errors, fatal errors, and shutdown dependency.
2. Add tests against the old/current behavior for known lifecycle risks: duplicate turn start, interrupted generation cleanup, failed sweep, listener source failure, repeated shutdown, and no work after disposal.
3. Convert the active turn runner into a scoped service using keyed fiber ownership. Keep its public operation Effect-native: admit/start/cancel/status as required by current routes.
4. Convert the reaper into a scoped recurring Effect. Use Effect scheduling and Clock; remove raw intervals/manual scope/run calls.
5. Convert cancel, activity, and host-result dispatchers into scoped services. Each listener source is acquired by the persistence Layer and consumed by one owner.
6. Define only the ownership seam needed by the ground-up PubSub event-stream service in Step 13. Preserve observable replay/live behavior, but do not repair or wrap the custom dispatcher as a long-term path.
7. Implement the permanent `BackgroundSupervisor` and root fatal Deferred/joined fiber. Normal shutdown interruption is not fatal; a fatal child Exit after readiness makes readiness false and terminates server lifetime nonzero.
8. Establish readiness state for background services. HTTP health must not claim readiness before mandatory listeners/resources acknowledge setup.
9. Emit supervision diagnostics through the permanent product telemetry/native Logger services established in Step 08. Do not introduce temporary observability plumbing.
10. Define shutdown dependencies so producer subscriptions stop and release actual LISTEN connections before the persistence pool/client factory closes. Add release-order probes.
11. Delete manual scope creation, explicit dispatcher/reaper shutdown methods, and detached run calls in converted code.

## Contract tests

- duplicate start for one turn creates at most one active generation fiber;
- a completed/failed/cancelled/interrupted turn leaves no registry entry;
- app-scope close interrupts blocked generation and runs terminal/release finalizers;
- reaper ticks under TestClock and does not overlap sweeps by accident;
- transient reaper failure is visible and a later tick still runs;
- permanent listener failure changes startup/readiness according to policy;
- a fatal listener failure after readiness completes the root fatal signal, stops HTTP, releases resources, and results in the selected nonzero exit policy;
- transient listener failure reconnects only through the later configured schedule;
- malformed notification does not terminate its source listener;
- dispatchers stop before repositories/pool are released;
- each configured notification channel has exactly one active LISTEN connection and partial channel startup failure releases earlier subscriptions;
- repeated app acquisition/disposal leaves zero active probe counts.

## Likely affected areas

- `apps/partner-ai-service/src/inbound/turn-runner/**`
- `apps/partner-ai-service/src/inbound/turn-stream/**`
- `apps/partner-ai-service/src/adapters/host-commands/host-command-result-dispatcher.ts`
- `apps/partner-ai-service/src/composition/persistence/notification-sources.ts`
- `packages/db/src/repositories/notifications/**`
- application Layer modules from Step 08
- health/readiness route dependencies

## Verification

```powershell
rg -n 'Scope\.make|Scope\.close|forkIn|Effect\.runSync|Effect\.runPromise|setInterval|setTimeout|shutdown:' apps/partner-ai-service/src
npm test -- apps/partner-ai-service/src/inbound/turn-runner
npm test -- apps/partner-ai-service/src/inbound/turn-stream
npm test -- apps/partner-ai-service/src/adapters/host-commands
npm run typecheck
npm run lint:custom
```

Review every remaining match. Boundary adapters may still run Effects until Step 15, but background owners may not.

## Completion checklist

- [ ] Background ownership/failure/readiness table is recorded.
- [ ] Turn fibers are keyed, supervised, and cleaned on every Exit.
- [ ] Reaper and listeners are scoped services with explicit failure policy.
- [ ] BackgroundSupervisor propagates fatal child exits to the root and distinguishes normal shutdown interruption.
- [ ] Dispatchers and registries stop in dependency-safe order.
- [ ] Health/readiness reflects mandatory background service state.
- [ ] Manual scope/run/shutdown plumbing is deleted from background owners.
- [ ] Virtual-time, interruption, failure, and repeated-disposal tests pass.
- [ ] Type and governance gates pass.
- [ ] `STATUS.md` records lifecycle evidence and remaining boundary runs.

## Handoff record

Background ownership table: pending

Readiness policy: pending

Release-order trace: pending

Verification: pending
