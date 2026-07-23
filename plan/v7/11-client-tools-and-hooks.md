# Step 11: Client Tools and Hooks (Host Integration)

Read this when: rebuilding the browser-executed tool capability (formerly "host commands") on native primitives.

Historical source for: the client-tool lifecycle, the hook-based wait, the result endpoint, ownership checks, and the exactly-once contract.

Not authoritative for: approvals (Step 12) or the widget dispatch code (Step 15 lands it; this step designs the client contract).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 05, 06, 09 (dispatch rows). Unblocks: Step 15.

## Outcome

Tools that execute in the embedding page use SDK client-tool machinery under SDK naming. The per-request host capability catalog becomes dynamic tools. The old resolver/dispatcher/relay stack (~1,600 lines) is not ported; its surviving policies — ownership binding, connected-client decision, timeout, exactly-once settle — wrap native mechanisms.

## Old-app semantics reference (the contract to preserve)

Verify in: `apps/partner-ai-service/src/adapters/host-commands/service-host-command-resolver.ts` (four settle paths raced exactly once: direct result, 2s persisted-result poll, 30s timeout, abort), `host-command-result-dispatcher.ts`, route ownership checks in `.../turns/host-commands/chat-turn-host-commands.ts` (settle requires the exact turn+command pair; a durable `emitted` row must exist; repost idempotent), tool exposure in `packages/agent-runtime/src/runtime/ai-sdk/tools/ai-sdk-tool-adapter.ts` (name-collision failure before execution), capability gating in `packages/host-bridge/src/commands/capability.ts`, browser dedupe in the widget's `maybeDispatchHostCommand`.

## Target design

### Catalog → dynamic tools

The host's per-page capability list (name, description, JSON Schema input) arrives with the POST as today. Per run: each capability becomes a tool; inputs validated against the host JSON Schema (the workflow path already carries Ajv-reconstructed JSON-Schema tools—reuse that representation); name collisions with server tools fail the request before the run starts. The stream announces calls through native `dynamic-tool`/tool-input parts; the Step 01-sanctioned `data-*` dispatch part is added only if the native part payload is insufficient for host-bridge routing (verify the actual shape first).

### The wait (durable hook)

Each client tool's `execute`:

1. persist the dispatch row `(turnId, toolCallId, toolName, state='dispatched')` (Step 09 table) — the anti-spoof anchor AND the result-before-hook safety;
2. check for an already-persisted result (idempotent replay must not wait again);
3. `createHook({ token: `tool:${runId}:${toolCallId}` })` raced against `sleep(settings.timeouts.clientToolMs)`;
4. timeout → typed timed-out output to the model; row `timed_out`;
5. result → validate, row `settled`, return output.

**Result-before-hook race**: the browser can POST after seeing the tool part but before hook creation. The durable row + check-before-wait covers it. Verify and record the pinned `resumeHook` unknown-token behavior; regardless, the endpoint persists the result first, and a missing hook cannot lose it.

The pinned agent emits the tool-input part before `execute` persists the row. An authenticated result for an owned run therefore receives a retryable `409` until that exact dispatch exists. After a process restart, the durable result is committed first and the same retryable response continues until Workflow has restored the hook and accepted the wake-up; duplicate submissions reuse the recorded outcome. An unknown or foreign run remains a hidden `404`. The host bridge retries the `409` in Step 15.

### Result endpoint

`POST /api/chat/:runId/tools/:toolCallId/output` (any instance): auth/tenancy → dispatch row exists for exactly this run→turn + toolCallId in the caller's tenant (a guessed id cannot settle a foreign call) → already settled? reuse the recorded outcome (idempotent) → persist result, then `resumeHook(token, output)` → acknowledge only after the wake-up is accepted; otherwise return retryable `409` while preserving the committed result → never log payload content.

### No-connected-client policy

Per Step 01: suspend until reattach, bounded by `clientToolMs` — the run is durable and the tool part replays to reconnecting tabs; on timeout the tool returns the typed timed-out result.

## Edge cases (each a test)

1. duplicate result POST → first outcome returned; tool executed once;
2. result for a foreign turn/tenant → 404/403, no settle;
3. timeout then late result → model already continued; row marked `late`; never re-injects;
4. result-before-hook window → picked up by check-before-wait; turn continues;
5. restart while waiting → hook survives; settle after restart resumes; settle POSTed to instance B while suspended from A resumes (permanent product-level durability proof);
6. no tab attached → run suspends per policy and times out to the typed result;
7. catalog name collision → request rejected before run start;
8. malformed result payload → typed error output to the model, row `failed`, no throw;
9. run cancelled while waiting → wait interrupted, row `aborted`, no dangling state;
10. replayed stream re-shows the tool part → settled-part state prevents double dispatch (contract for Step 15).

## Verification

```powershell
npm test -- apps/side-chat-service/src/tools
npm test -- apps/side-chat-service/src/adapters/http
npm run typecheck
npm run lint:custom
rg -n "hostCommand|HostCommand" apps/side-chat-service packages/host-bridge
```

The `rg` documents remaining old naming in `host-bridge` (renamed in Steps 15/20; record findings).

## Completion checklist

- [x] Catalog → dynamic tools with collision check and pinned draft-07 JSON-Schema admission.
- [x] Wait + result endpoint with the dispatch-row contract; edge cases split across focused, database, and compiled tests.
- [x] Exactly-once settle proven under duplicate/late/racing results; cross-instance + restart survival.
- [x] Payload-privacy sentinels pass.
- [x] Old resolver/dispatcher untouched (deleted in Step 20).

## Handoff record

Catalog and execution: `application/turn/tools/client-tool-catalog.ts` owns the
bounded serializable definition plus duplicate/server-shadowing and pinned
draft-07 admission policy. The current server-tool catalog is empty, so the
live shadow check has no server names yet. `workflows/client-tools` maps admitted
definitions to AI SDK `dynamicTool` values, wires them into `WorkflowAgent`, and
uses the pinned Workflow Ajv reconstruction to validate each model-produced
input against the host schema. Admission allows at most 16 tools, 64-character
identifiers, 1,024-character descriptions, and schemas bounded to 16 KiB,
16 levels, and 256 nodes; malformed keyword values and unsafe regex shapes are
rejected before a durable run starts. Client-tool requests also require durable
product persistence at admission time.

Endpoints, dispatch-row states: authenticated `POST /api/chat/:runId/tools/:toolCallId/output`; `dispatched → settled|failed|timed_out|aborted`, with `timed_out → late` preserving the model's timeout output.

resumeHook unknown-token handling applied: persist first; catch only pinned `HookNotFoundError`; the workflow rereads after hook registration, while a retryable `409` makes duplicate POSTs repeat the wake-up until restored Workflow registration becomes visible.

Policies applied (no-client, timeout, late-result): durable wait with `timeouts.clientToolMs`; replay restores native `dynamic-tool` identity; cancellation claims `aborted`; private output is persisted for the model but removed from acknowledgements, diagnostics, and outbound replay.
