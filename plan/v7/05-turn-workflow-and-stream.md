# Step 05: Turn Workflow and Stream Endpoint — Core

Read this when: implementing the chat turn's happy path, cancellation, and terminal invariants.

Source of truth for: the POST route order, the agent/run construction, and the exactly-one-terminal contract.

Not source of truth for: the scrub filter/profile (Step 06), reconnect (Step 07), title/edge-case sweep (Step 08), storage shapes (Step 09 — this step uses its interfaces or temporary in-memory stand-ins if executed first; record which).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 04. Unblocks: Steps 06, 07, 08, 09, 17.

## Outcome

A user message becomes a streamed assistant turn: route → policy → agent → UI message stream v1 → client. `[workflow-branch]` the turn is a durable run; `[fallback]` a request-bound `ToolLoopAgent` call. Exactly one terminal part in every scenario this step owns.

## Old-app behavior reference (read, do not port)

- Turn start + busy/guard policy: `apps/partner-ai-service/src/inbound/http/routes/chat/turns/chat-turns.ts`, `packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts`.
- Terminal discipline: `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-stream-state-machine.ts` and `finalization/**` (exactly one terminal; nothing after it).

## Target design

### Route: `POST /api/chat` (final path recorded here) — order is load-bearing

1. auth/tenancy (Step 04 middleware);
2. zod request validation (messages, conversation ref, model preference, client-tool catalog passthrough for Step 11);
3. conversation ownership + busy policy — race-safe via the Step 09 partial unique index (one `running` turn per conversation);
4. **admission seam**: named `admitTurn()` returning a release handle; pass-through until Step 17 implements it; rejection contract typed now (503 + safe code + `Retry-After`);
5. persist the user message + create the turn row (Step 09 interfaces) — after admission, so rejection leaves no residue;
6. start the run; stream the response.

### Agent and run

`[workflow-branch]` `chatTurnWorkflow(turnRef, messages, catalog)` — a `'use workflow'` function running one `WorkflowAgent`:

- `instructions` from config (system-in-messages stays rejected — default flag untouched);
- `model` via `assertModelInstance`; `tools`: server tools now, Steps 11/12 add more;
- `stopWhen: isStepCount(settings.agent.stopWhenSteps)`; `maxRetries: 0`; `timeout: settings.timeouts.totalMs` (plain number on this path);
- `writable: getWritable<ModelCallStreamPart>()`;
- `onEnd`: persist assistant message + terminal status + usage via Step 09's idempotent persist;
- workflow-level catch: persist a failed terminal (safe code) — **no run may end without durable turn status**.

`[fallback]` `ToolLoopAgent` with granular `timeout: { totalMs, chunkMs, toolMs }`, same callbacks, response streamed from the result.

### Stream response

POST responds with `createUIMessageStreamResponse` over `run.readable.pipeThrough(createModelCallToUIChunkTransform())` `[workflow-branch]` (direct agent stream `[fallback]`), with the Step 04 keepalive injected and header `x-workflow-run-id` `[workflow-branch]`. The Step 06 scrub transform slots into this chain — leave a named seam (`outboundTransforms: []`).

### Cancellation

`POST /api/chat/:runId/cancel` always performs auth/ownership first and drives the cancellation owner selected in Step 02b. `[workflow-branch]` use the verified cross-process/distributed abort mechanism so an `AbortSignal` reaches the active `WorkflowAgent.stream` provider call, then persist a clean cancelled terminal; use `run.cancel()` only as a forced fallback when graceful abort signaling cannot be delivered. `[fallback]` abort the request-owned controller. In both branches the test must observe provider abort directly—run status alone is not proof—and reject all later content.

## Edge cases owned by this step (each a test)

1. happy path: stream shape (versioned header, part ordering, single `finish`), turn persisted, usage recorded once (multi-step sums steps — assert against scripted per-step usage);
2. cancel before the first chunk → admission released; retain the accepted user message and a cancelled turn for audit/history, but do not create an empty assistant message;
3. explicit cancel mid-stream → clean cancellation part/state + cancelled terminal + provider abort observed by the mock;
4. provider error before any output → one error part, one failed terminal, no HTTP status rewrite after SSE start;
5. provider error mid-stream → partial text + one error part; partial-persist decision recorded (with Step 09);
6. busy conversation → typed rejection before any write;
7. ownership violation on POST/cancel → rejected;
8. keepalive frames present and decoder-transparent.

## Verification

```powershell
npm test -- apps/side-chat-service/src/http
npm test -- apps/side-chat-service/src/workflows
npm run typecheck
npm run lint:custom
rg -n "allowSystemInMessages|fullStream" apps/side-chat-service
```

The `rg` must return zero.

## Completion checklist

- [ ] POST + cancel routes with the load-bearing order; run construction per branch.
- [ ] All 8 edge cases tested with mock providers.
- [ ] Admission seam + outbound-transform seam named and typed.
- [ ] `onEnd`/catch guarantee: no run without durable terminal status.
- [ ] Old app untouched.

## Handoff record

Final routes and modules: pending

Cancel-before-first-chunk invariant evidence: pending

Stand-ins used for Step 09 interfaces (if any): pending
