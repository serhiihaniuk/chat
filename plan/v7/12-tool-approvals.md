# Step 12: Tool Approvals

Read this when: adding human sign-off for risky tools.

Source of truth for: the execution gate, native approval stream vocabulary, Side Chat authorization/audit policy, expiry, and approval conformance tests.

Not source of truth for: the gated-tool inventory (Step 01) or card UI (Step 15).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 05, 06, 09. Unblocks: Step 15.

## Outcome

No gated tool side effect can occur without a durable authorized decision. The browser sees AI SDK approval part shapes; Side Chat owns authorization, audit, expiry, and the final execution barrier. This is a security invariant, not a presentation feature.

## Current pinned-path decision

Do **not** trust WorkflowAgent `needsApproval` as the gate. The current ignored source clone contains approval logic, but its compiled end-to-end test (`packages/workflow/src/workflow-agent-e2e.integration.test.ts`, “tool approval (GAP)”) states that `needsApproval` is ignored and the tool executes immediately.

Therefore the Workflow substrate uses a **durable execution gate inside every gated tool**:

1. before any side effect, create/upsert the approval request row with a unique `(turnId, toolCallId)` key and input digest;
2. emit the native `tool-approval-request` UI chunk shape through the workflow writable;
3. create a deterministic approval hook and race it against durable expiry;
4. on resume, reload the durable decision and revalidate tenant/owner, tool identity, input digest, schema, and current policy;
5. only an approved decision enters the idempotent side-effect step; denial/expiry returns the native denied result shape;
6. retries/replay reuse the same row, decision, and idempotency key.

This is not a parallel approval protocol: wire vocabulary and tool lifecycle stay AI SDK-native; the hook is the Workflow-supported durability primitive that closes a documented integration gap. Remove this wrapper only when the exact pinned compiled-path conformance test proves native `needsApproval` prevents execution before decision. A unit test of `WorkflowAgent` alone is insufficient.

On the fallback substrate, use `ToolLoopAgent.toolApproval` plus `experimental_toolApprovalSecret`. The authenticated decision endpoint writes/audits the decision and returns the signed approval payload; the widget feeds it to native `addToolApprovalResponse`, and the next transport POST revalidates both the stored decision and HMAC before ToolLoopAgent continuation. The pending state persists in the saved `UIMessage`; execution remains live-session/request-bound by the fallback contract.

## Policy layer

- **Endpoint:** `POST /api/chat/:runId/approvals/:approvalId` with `{ approved, reason? }`.
- **Authorization:** authenticated conversation owner from Step 01; verify tenant, conversation, turn, run, approval, tool call, and input digest before changing state.
- **State machine:** `requested → approved|denied|expired`; exact duplicate is idempotent; conflicting or late decision is rejected and audited.
- **Audit:** approver identity, tenant/conversation/turn, tool name, tool-call/approval ids, input digest, decision, reason, requested/decided/expires timestamps. Never duplicate raw input into the audit row.
- **Expiry:** durable hook race, default 24h unless Step 01 records otherwise; no attached client required.
- **Idempotency:** a mutating tool receives an execution key derived from the durable approval/tool-call identity; approval alone never makes an at-least-once side effect safe.

## Edge cases

1. execute spy proves a gated tool cannot run before decision;
2. approve executes exactly once under duplicate hook delivery and workflow replay;
3. deny yields native denied state and no side effect;
4. expiry with zero clients yields denial and terminal progress;
5. non-owner/foreign tenant decision changes nothing;
6. duplicate same decision is idempotent; conflicting decision fails;
7. decision after cancellation fails cleanly and is audited;
8. per-input policy gates risky input and clears safe input;
9. fallback tampering fails HMAC/input-digest validation;
10. Workflow process restart between request and decision resumes safely;
11. refresh replays the approval request and the later decision without duplicate cards;
12. tool removed or policy changed while suspended denies safely;
13. compiled Workflow conformance fixture reproduces the upstream `needsApproval` behavior and proves our execution wrapper still blocks it;
14. raw tool input, provider text, and secrets never enter logs/audit/public errors.

## Verification

```powershell
npm test -- apps/side-chat-service/src/tools/approvals
npm test -- apps/side-chat-service/src/http
npm run test:service:compatibility
npm run typecheck
npm run lint:custom
```

## Failure meaning

- Any side-effect spy firing before a durable approved decision is a release blocker.
- A passing in-memory unit test with a failing compiled Workflow fixture means the gate is not proven.
- A decision that depends on a live browser/socket violates the durable-approval contract.

## Completion checklist

- [ ] Gated inventory wired from Step 01.
- [ ] Durable execution gate precedes every gated side effect on Workflow.
- [ ] Native approval part shapes drive the widget; no shadow approval protocol.
- [ ] Endpoint authorization, audit, expiry, replay, and idempotency complete.
- [ ] All fourteen edge cases pass on the selected substrate.
- [ ] Upstream GAP status and wrapper-removal criterion recorded in `KNOWLEDGE.md`.

## Handoff record

Gated tools and policy functions: pending

Execution-gate and hook modules: pending

Compiled-path conformance result: pending

Audit schema, expiry, and idempotency keys: pending
