# Step 14: Complete Native Effect Observability

Read this when: adding structured logs, traces, metrics, or exporter composition to the Effect architecture.

Source of truth for: semantic instrumentation boundaries, privacy/cardinality rules, and observability Layer ownership.

Not source of truth for: external vendor selection or production telemetry credentials.

Status: `not_started`

Owner: unassigned

Depends on: Step 13

Unblocks: Steps 15-16

## Outcome

Core and service runtime behavior uses native Effect Logger, Tracer, and Metric services through permanent composed Layers. Product-safe domain telemetry remains an explicit required service with Live and no-op/test Layers. Instrumentation is semantic, low-cardinality, privacy-safe, and never executed through fire-and-forget run calls. Only external exporter selection is optional; native observability is not.

## Observability model

### Native runtime observability

Use Effect Logger for structured operational records, Tracer for spans, and Metric for counters/gauges/histograms. These use the Effect environment/runtime and inherit fiber annotations/context.

### Product telemetry

Retain the useful intent of `ObservabilitySinkPort`/turn telemetry as a cohesive required service for product-domain events that may feed analytics or business-safe diagnostics. Rename only if the new name is more precise. Provide an explicit no-op Layer for environments that intentionally discard it; do not use optional lookup.

### Exporters

An in-memory test collector and local console Layer are mandatory. OTLP or another external exporter is selected by service configuration. If disabled, native spans/metrics still work with test/local collectors and product telemetry; workflow call sites do not change. If selected Effect v4 exposes the exporter under an unstable import, isolate it in one module and add an upgrade contract test.

## Semantic span plan

Instrument operations that explain a turn or service lifecycle:

- request admission;
- turn preparation and policy/context stages;
- provider selection/execution and first/last event timing;
- tool execution and host-command wait;
- lease acquisition/heartbeat outcome;
- persistence commit/finalization;
- replay/live subscription lifecycle;
- reaper sweep and notification reconnect;
- application acquisition/readiness/shutdown.

Do not create a span for every helper, token delta, queue operation, or pure transformation. Use `Effect.fn`/named tracing only where it improves a human trace. Verify selected-version `Effect.fn` and untraced helper APIs before adoption.

## Metric plan

At minimum, consider:

- admitted, queued, rejected, active, and completed turns;
- provider active permits, wait duration, execution duration, and terminal result;
- tool active count/duration/result;
- pending host commands, timeout, abort, late result;
- event subscriber count, lag/drop/reconciliation;
- lease retry/loss;
- reaper sweep result and stale turns recovered;
- notification reconnect/fatal failure;
- resource acquisition/release and shutdown duration.

Labels may include stable low-cardinality values such as provider kind, configured model alias, operation, outcome tag, tool category, or persistence mode. Never label with user, tenant, workspace, conversation, turn, request, command, tool-call, or raw model IDs if their cardinality is unbounded.

## Privacy rules

Do not record prompts, system prompts, retrieved content, model output, reasoning content, raw tool arguments/results, host-command payloads/results, secret values, environment values, database URLs, authorization headers, or raw provider/database errors.

Identifiers should generally remain absent. If a request-scoped log correlation ID is operationally necessary, keep it in logs/spans only under the repository's privacy policy and never as a metric label. Tests must use sentinel secrets/content to prove exclusion.

## Implementation sequence

1. Inventory current console diagnostic logger, observability sink, telemetry helpers, and every detached `Effect.runPromise(...).catch` used only to record something.
2. Define a safe annotation vocabulary and allowed metric label sets. Add a reviewable constant/table so instrumentation cannot improvise raw fields.
3. Extend Step 08's permanent native foundation into complete logger/tracer/metric Layers for in-memory test, local console, and configured production exporter variants. Do not replace the service contract or call-site API.
4. Convert product telemetry into a required service Layer. Preserve domain event behavior and tests; remove optional plumbing.
5. Instrument the semantic boundaries above. Let Effects compose instrumentation; do not execute logging/metric Effects from inside callbacks with run calls.
6. Add supervisor/background diagnostics from Step 09 and retry/capacity/fan-out hooks from Steps 11-13.
7. Add test collectors for logs, spans, and metric updates. Assert names, outcomes, counts, and absence of forbidden data.
8. Isolate any unstable OTLP adapter and test that the application graph can omit it cleanly.
9. Delete superseded console wrappers, detached record helpers, duplicated duration measurement, and raw error logging.
10. Update operations docs with enablement, safe field policy, and what health/metrics mean. Do not document credentials inline.

## Contract tests

- one successful and one failed/cancelled turn produce the expected semantic span tree without per-delta spans;
- active gauges return to zero after success, failure, interruption, and app disposal;
- retry and capacity counters reflect deterministic contract scenarios;
- background fatal/recoverable states are observable;
- no instrumentation failure changes product workflow outcome unless an explicitly mandatory exporter fails at startup;
- forbidden sentinel values never appear in collected logs/spans/metrics;
- metric label sets remain from the approved finite vocabulary;
- no test or production instrumentation path calls an Effect run function internally;
- the graph boots with console/test exporter and with exporter omitted/no-op as designed.

## Likely affected areas

- `apps/partner-ai-service/src/adapters/observability/**`
- `apps/partner-ai-service/src/composition/diagnostics/**`
- core turn observability/telemetry ports and use cases
- application Layer
- semantic workflow boundaries across core/runtime/service
- operations configuration and verification docs

## Verification

```powershell
rg -n 'console\.|ObservabilitySinkPort|Effect\.runPromise.*catch|Effect\.runSync|Metric|Tracer|Logger' packages/partner-ai-core packages/agent-runtime apps/partner-ai-service
npm test -- <observability-contract-files>
npm run typecheck
npm run lint:oxlint
npm run lint:custom
```

Review console matches; executable/local exporter edges may be legitimate. Workflow-level raw console/run calls are not.

## Completion checklist

- [ ] Native logger, tracer, and metric Layers exist for test/local/production composition.
- [ ] Product telemetry is a required service with explicit no-op/test Layers.
- [ ] Semantic boundaries are instrumented without per-delta/helper noise.
- [ ] Metric labels follow the approved low-cardinality table.
- [ ] Privacy sentinel and gauge-release tests pass.
- [ ] No fire-and-forget observability Effects remain.
- [ ] Unstable exporter imports are isolated and optional.
- [ ] Obsolete diagnostic wrappers are deleted.
- [ ] Operations docs, tests, typecheck, and governance pass.
- [ ] `KNOWLEDGE.md` and `STATUS.md` record the final vocabulary/exporter posture.

## Handoff record

Observability Layer entry points: pending

Approved annotations/labels: pending

Unstable exporter adapter: pending

Privacy test evidence: pending

Verification: pending
