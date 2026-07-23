# Step 15: Widget — Client-Tool Dispatch and Approval Interactions

Read this when: wiring the browser side of client tools and approval decisions.

Historical source for: `onToolCall` dispatch, host-bridge integration, dispatch dedupe, and the approval card's decision flow.

Not authoritative for: server mechanics (Steps 11/12) or rendering (Step 14).

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

- [x] onToolCall dispatch with both dedupe layers; bridge integration intact.
- [x] Approval card actions against the real decision endpoint; disabled states.
- [x] All nine edge cases tested.
- [x] host-bridge renames done or explicitly deferred to Step 20 with a list.

## Handoff record

Dispatch/approval modules:

- `packages/host-bridge/src/bridge/bridge.ts` and `commands/{capability,command-dispatcher,command-result}.ts` expose the native client-tool catalog, capability gate, dispatcher, and result shape while retaining the legacy bridge surface for the protocol branch.
- `packages/side-chat-widget/src/entities/workflow-chat/model/workflow-interaction-client.ts` owns the Step 11 output and Step 12 decision HTTP contracts, including request-time auth and the bounded result-before-hook retry.
- `packages/side-chat-widget/src/features/workflow-chat/model/client-tools/` owns dynamic-tool filtering, settled/in-flight dedupe, host dispatch, exception normalization, and handing the safe output to the interaction client.
- `packages/side-chat-widget/src/features/workflow-chat/model/approval/` owns the duplicate-click guard, typed failed states, and the local native-part acknowledgement after the durable server acknowledgement.
- `packages/side-chat-widget/src/features/workflow-chat/ui/workflow-tool-presentation.tsx` owns the approval card and its requested/approved/denied/expired/foreign/failed presentation.

Nine-case evidence:

1. Browser round trip: `workflow-interactions.spec.ts`; the Step 11 durable hook/provider continuation remains covered by the server client-tool suites.
2. Settled refresh skip and one unsettled reload dispatch: `workflow-client-tool-dedupe.test.ts`.
3. Concurrent re-render/in-flight dedupe: `workflow-client-tool-dedupe.test.ts`.
4. Throwing bridge becomes a posted failed result: `workflow-client-tool-dispatch.test.ts`.
5. Approve POST and same-row decided state: `workflow-interactions.spec.ts` and `use-workflow-widget-chat.test.tsx`.
6. Denial response, denied row, and later text: `workflow-approval.test.ts` and `workflow-message-timeline.test.tsx`.
7. Expired decision renders a disabled typed state: `workflow-approval.test.ts` and `workflow-message-timeline.test.tsx`.
8. Duplicate browser decision is single-flight: `workflow-approval.test.ts`; Step 12's application test proves the server duplicate produces one durable decision/audit outcome.
9. Missing capability produces a posted unsupported result: `workflow-client-tool-dispatch.test.ts`.

Deferred renames to Step 20: `HostCommand`, `HostCommandResult`, `HostCommandDispatcher`, `dispatchCommand`, and `HostCapabilities.commands`. They remain only because the legacy protocol widget branch still consumes them. Step 20 owns that branch's cutover and deletion; the native workflow branch uses `HostToolCall`, `HostToolResult`, `HostToolDispatcher`, `dispatchToolCall`, and the client-tool catalog adapter now.

Browser evidence:

- [`client-tool-dispatched.png`](./evidence/task-15-widget-interactions/client-tool-dispatched.png) — the native dynamic call mutates the visible host surface once and records one applied host dispatch.
- [`approval-approved.png`](./evidence/task-15-widget-interactions/approval-approved.png) — the same approval card is disabled and updated to `approved` after the decision POST.
- Reproducible command: `npx playwright test -c test-harness/widget-harness/e2e/workflow.playwright.config.ts` (2/2 green).

Focused verification: widget 50 files / 264 tests, host bridge 2 files / 8 tests, harness 1 file / 9 tests, Step 11/12 server routes and application handlers 4 files / 20 tests, interaction slice 4 files / 21 tests, scoped typecheck, scoped Oxlint, custom governance, human-readability, formatting, and diff checks all green. Repository-wide Oxlint remains blocked only by unrelated active DB and service drift; it reported no Task 15 paths. The default legacy Playwright config is independently blocked by the removed `@side-chat/db` export `createMemorySidechatRepositories`, so the native Workflow proof uses the isolated deterministic config above.
