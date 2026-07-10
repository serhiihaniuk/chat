# Step 18: Telemetry and Observability Completion

Read this when: completing runtime observability on the Step 04 foundation.

Source of truth for: the telemetry event/metric inventory, label vocabulary, privacy tests, and exporter posture.

Not source of truth for: the registration bootstrap (Step 04) or business analytics.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 08, 11, 12, 17 (the instrumented surfaces exist). Unblocks: Step 19.

## Outcome

The system answers "what is it doing and how well" without leaking content: SDK-native lifecycle events flow through our `Telemetry` implementation into the sink, our own counters cover what the SDK cannot see, and privacy is proven by sentinel tests rather than promised.

## Target inventory

### From the SDK `Telemetry` interface (registered once, Step 04)

Model-call/step start-end timings, tool execution start-end + outcomes, abort reasons, end events; `finalStep.performance` (`timeToFirstOutputMs`, `outputTokensPerSecond`, `responseTimeMs`); finish reasons. `[workflow-branch]` caveat: the workflow telemetry bridge is young (TODO(#12164) — "approximately compatible") — assert only events it demonstrably delivers on the pinned version; the assertion list goes in the handoff.

### Ours (the SDK cannot see these)

Admission: admitted/queued/rejected/active, queue-wait duration (Step 17 counters). Client tools: waits started, settled/timed_out/late outcomes. Approvals: requested/approved/denied/expired. Streaming: reconnect counts, scrub-filter unknown-chunk counter, keepalive health. Persistence: pruning results (runs pruned, bytes), drift-degrade counter. **Age of the oldest non-terminal run** — the stuck-run alarm: every wait is bounded by a durable timer, so a run older than the largest configured timeout + grace indicates a runtime bug; alert, never auto-delete.

### Labels

Low-cardinality only: provider kind, model alias, outcome tag, tool name (our bounded set), operation. **Never** conversation/turn/user/run/toolCall ids as metric labels. Codify as an exported allowlist table; a test asserts every emitted label set is a subset.

### Privacy

No prompts, message content, reasoning text, tool inputs/outputs, host payloads, secrets, database URLs, or raw provider/database error strings anywhere in logs/spans/metrics. Proven by sentinel tests: scripted turns carry marker strings through every path (prompt, tool input, tool output, provider error, approval input) and the collected telemetry is searched for them.

### Exporter posture

In-memory collector (tests) and console (local) mandatory; OTLP (`@ai-sdk/otel`) optional by config, its import isolated in the Step 04 module; the app must boot and run with the exporter absent (test).

## Edge cases (each a test)

1. one successful multi-step turn produces the expected event sequence (per the pinned-version assertion list) with correct timings present;
2. failed, cancelled, and timed-out turns each produce their outcome events; gauges return to zero after each;
3. sentinel strings never appear in any collected output;
4. label allowlist test passes across a mixed scenario batch;
5. exporter omitted → boots, runs, tests pass;
6. instrumentation failure (throwing sink) never changes a product outcome (fail-open sink contract);
7. stuck-run alarm fires in a simulated stuck scenario (non-terminal run older than threshold) and not during normal long waits.

## Verification

```powershell
npm test -- apps/side-chat-service/src/telemetry
npm test -- apps/side-chat-service
npm run typecheck
npm run lint:custom
rg -n "console\.(log|error|warn)" apps/side-chat-service/src --glob '!**/telemetry/**'
```

Review remaining console matches; the composition root/local exporter may be legitimate — document each.

## Completion checklist

- [ ] SDK Telemetry implementation complete with the per-version assertion list.
- [ ] All "ours" counters emitting, incl. the stuck-run alarm.
- [ ] Label allowlist enforced by test; privacy sentinels pass.
- [ ] Exporter-optional boot proven; fail-open sink proven.
- [ ] Operations docs updated with what each signal means.

## Handoff record

Event/metric inventory as implemented: pending

Workflow-bridge assertion list: pending

Legitimate console usages: pending
