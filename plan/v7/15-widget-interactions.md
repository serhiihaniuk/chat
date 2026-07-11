# Step 15: Widget — Client-Tool Dispatch and Approval Interactions

Read this when: wiring the browser side of client tools and approval decisions.

Source of truth for: `onToolCall` dispatch, host-bridge integration, dispatch dedupe, and the approval card's decision flow.

Not source of truth for: server mechanics (Steps 11/12) or rendering (Step 14).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 11, 12, 13, 14. Unblocks: Step 16.

## Outcome

The model can drive the embedding page (client tools) and ask for sign-off (approvals) end-to-end from the widget, with exactly-once browser execution and decisions that pass the server's policy layer.

## Current evidence to verify

- Host-bridge dispatch path being rewired: `packages/host-bridge/src/{bridge/bridge,commands/command-dispatcher,commands/capability,commands/command-result}.ts`—the browser integration stays; only the widget-side caller and naming change (SDK naming per Step 01; rename exports that mirror deleted concepts and record what waits for Step 20).
- Old dedupe semantics to preserve: `maybeDispatchHostCommand` in `widget-run-subscription.ts` — dispatch once per call, skip already-resolved on replay.

## Target design

### Client tools

- `onToolCall`: filter `dynamic` tools (`toolCall.dynamic` guard) → resolve against the host-bridge capability registry → dispatch through `command-dispatcher` → `POST` the output to Step 11's result endpoint.
- Dedupe by part state: a tool part already `output-available`/settled (from replay or refresh) is never re-dispatched; an unsettled part re-dispatches exactly once. In-flight dedupe: a dispatch in progress is not restarted by a re-render (ref-guard keyed by `toolCallId`).
- Dispatcher exceptions become failed outputs POSTed to the server (never thrown into React), matching the bridge's existing convention.
- Continuation is server-side: the result endpoint resumes the durable hook. The widget never drives continuation — assert no client auto-resubmit fires (`addToolOutput`/`sendAutomaticallyWhen` unused) (test).

### Approvals

- The Step 14 approval card sends approve/deny (+ optional reason) to Step 12's decision endpoint. The endpoint resumes the durable approval hook, and replay updates the card.
- Card disabled states: already-decided (idempotent server echo), expired (typed denial rendering), foreign-decider rejection surfaced calmly.
- After a decision, the continued stream updates the same tool row through its later states — no duplicate rows.

## Edge cases (each a test)

1. full client-tool round-trip on the fake provider: model calls → browser executes via bridge → output POSTed → model uses the result in its next step → timeline shows one coherent row;
2. refresh mid-client-tool: settled part not re-dispatched; unsettled part dispatched exactly once after reload;
3. re-render storm during dispatch → single execution (ref-guard);
4. bridge throws → failed output POSTed, row shows failed, no React error boundary hit;
5. approval approve → tool executes; card shows decided; timeline updates in place;
6. approval deny → `output-denied` row; model's follow-up text renders;
7. decision on an expired approval → typed denial rendering, no crash;
8. duplicate decision click → idempotent, single audit record (server assertion);
9. capability missing for a dispatched tool (page changed since catalog was sent) → failed output with the bridge's unsupported semantics, calm row.

## Verification

```powershell
npm test -- packages/side-chat-widget
npm test -- packages/host-bridge
npm run typecheck
npm run lint:custom
```

Browser end-to-end via the preview workflow: a scripted page capability + a gated tool exercised live; screenshots.

## Completion checklist

- [ ] onToolCall dispatch with both dedupe layers; bridge integration intact.
- [ ] Approval card actions against the real decision endpoint; disabled states.
- [ ] All nine edge cases tested.
- [ ] host-bridge renames done or explicitly deferred to Step 20 with a list.

## Handoff record

Dispatch/approval modules: pending

Deferred renames: pending

Browser evidence: pending
