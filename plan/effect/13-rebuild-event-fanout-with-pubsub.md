# Step 13: Rebuild Event Fan-Out with Effect PubSub

Read this when: replacing the current live event dispatcher/subscription registry with Effect PubSub.

Source of truth for: the PubSub live fan-out design, durable replay composition, overflow behavior, and deletion contract.

Not source of truth for: public `sidechat.v1` event shapes or durable event-log schema.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 12

Unblocks: Steps 14-16

## Outcome

The event replay/live subsystem uses Effect PubSub as its scoped, bounded process-local live fan-out primitive. The durable event log remains authoritative for replay, dense sequence order, terminal truth, and reconciliation. The custom live dispatcher and subscription registry are deleted.

## Architectural decision

The current stream is more than broadcast: subscribers replay durable events, cross to live delivery, preserve dense sequence order, reconcile dropped signals, and handle slow consumers. PubSub owns the live signal and subscriber lifecycle. PostgreSQL/event-log services own durable truth and recovery.

This split uses Effect's tested queue, subscription, scope, shutdown, and overflow semantics without pretending an in-memory primitive is durable. Do not rebuild a custom PubSub abstraction or reopen the adoption decision.

The selected design is one application-scoped global sliding PubSub with capacity 4,096 safe signals. Each signal contains only durable turn identity and committed sequence, never event content. Subscribers filter for their turn and always reconcile from the event log after a matching signal or the configured durable reconciliation tick. Sliding overflow can delay wake-up but cannot lose durable events or terminal completion.

## Behavior contract

The PubSub implementation must preserve:

- authorization and ownership before subscription;
- durable replay from the requested sequence;
- dense, monotonic event order;
- exactly one terminal event;
- no duplicate/lost event at replay-to-live handoff;
- explicit slow-subscriber strategy;
- recovery/reconciliation after a dropped live signal;
- cancellation on client disconnect and application shutdown;
- release of subscriber queues/listeners;
- bounded memory and safe overload behavior;
- no provider-native or Effect types in public protocol DTOs.

## Implementation sequence

1. Run the Step 02 service streaming conformance suite against the post-Step-12 implementation and record current replay/live owners, bounds, and known defects.
2. Verify selected-version PubSub semantics from declarations/source: bounded/sliding/dropping construction, publish result, subscription scope, shutdown, interruption of blocked publishers/subscribers, and lag/drop visibility.
3. Implement the selected global sliding capacity of 4,096 using the equivalent API in the pinned v4 release. If the constructor name changed, preserve the semantics rather than reopening topology/capacity.
4. Write a ground-up scoped `TurnEventStream` service composed from the durable event-log service and a private PubSub. It exposes Effect operations to publish after commit and subscribe/replay by sequence. It does not expose PubSub, callbacks, actual event payloads, or legacy dispatcher shapes.
5. Use the application-scoped global topology. Subscribers filter safe signals by turn. Measure irrelevant wake-ups in stress tests; do not add a per-turn topic registry unless a later measured architecture change explicitly supersedes this plan.
6. Publish only after a durable event commit. Treat a live signal as a prompt to read from the next durable sequence, so coalesced or dropped signals cannot cause permanent loss.
7. Implement replay-to-live as one new algorithm: establish the scoped live subscription, read durable events through a captured high-water mark, reconcile events committed during that read, then wait for signals and read from the next sequence. Preserve exactly-once output.
8. Race live signals with the validated durable reconciliation schedule so a dropped final signal cannot leave a subscriber waiting forever. Close subscriptions on disconnect, terminal replay, and application shutdown.
9. Emit lag/drop/reconciliation observations through the permanent observability services established in Step 08.
10. Cut composition directly to the new service. Delete `turn-event-dispatcher`, the custom registry, callbacks, manual queues/scopes, compatibility adapters, and internal-shape tests in the same step.

## Contract tests

- replay-only terminal turn closes without creating a persistent live subscription;
- event persisted during replay/live transition is delivered once;
- multiple subscribers receive the same ordered durable sequence;
- slow subscriber follows the documented bounded strategy and reconciles correctly;
- dropped signal does not cause permanent event loss;
- a dropped/coalesced terminal signal is found by the reconciliation tick and closes the stream;
- unrelated-turn signals do not emit output for a subscriber;
- disconnect releases the subscriber immediately;
- terminalization releases per-turn live resources;
- app shutdown closes all subscribers and blocked takes/offers;
- memory/resource probes stay bounded under repeated subscribe/disconnect;
- protocol output remains unchanged.

The final tests target the PubSub implementation composed with the durable event log.

## Likely affected areas

- `apps/partner-ai-service/src/inbound/turn-stream/turn-event-dispatcher.ts`
- `apps/partner-ai-service/src/inbound/turn-stream/turn-subscription-stream.ts`
- `apps/partner-ai-service/src/inbound/http/routes/chat/turn-stream-response.ts`
- streaming integration tests and test harnesses
- event-log persistence adapters
- application Layer and observability hooks

## Verification

```powershell
npm test -- apps/partner-ai-service/src/inbound/turn-stream
npm test -- apps/partner-ai-service/src/inbound/http/streaming
npm run typecheck
npm run lint:custom
```

Also run a deterministic slow-subscriber/replay-handoff stress suite repeatedly. Record bounds and resource-probe results.

## Completion checklist

- [ ] Selected-version PubSub semantics were verified from declarations/source.
- [ ] The global sliding PubSub has capacity 4,096 and publishes only safe turn/sequence signals.
- [ ] Durable commit precedes publish and sequence gaps reconcile from the event log.
- [ ] The custom dispatcher/registry and every compatibility shape are deleted.
- [ ] Replay/live, slow subscriber, drop reconciliation, disconnect, terminal, and shutdown tests pass.
- [ ] Subscriber memory/resources are bounded and scoped.
- [ ] Public protocol semantics remain unchanged or an explicit coordinated change is documented.
- [ ] Type and governance gates pass.
- [ ] `KNOWLEDGE.md` and `STATUS.md` record the decision and evidence.

## Handoff record

Decision: Effect PubSub for live signals; durable event log for replay and reconciliation

Rejected alternative: repaired custom live dispatcher, because it would duplicate Effect's scoped subscription, bounded queue, shutdown, and backpressure primitives

Selected bounds/drop semantics: global sliding capacity 4,096; durable reconciliation tick guarantees recovery

Stress evidence: pending

Verification: pending
