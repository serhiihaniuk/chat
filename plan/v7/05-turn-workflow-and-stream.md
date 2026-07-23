# Step 05: Turn Workflow and Stream Endpoint — Core

Read this when: implementing the chat turn's happy path, cancellation, and terminal invariants.

Historical source for: the POST route order, the agent/run construction, and the exactly-one-terminal contract.

Not authoritative for: the scrub filter/profile (Step 06), reconnect (Step 07), title/edge-case sweep (Step 08), storage shapes (Step 09 — this step uses its interfaces or temporary in-memory stand-ins if executed first; record which).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 04. Unblocks: Steps 06, 07, 08, 09, 17.

## Outcome

A user message becomes a streamed assistant turn with a durable Workflow journal outcome: route → policy → `WorkflowAgent` → UI message stream v1 → client. Exactly one terminal part appears in every scenario this step owns. Until Step 09, accepted messages and the query projection use the explicitly disposable in-memory adapter; the Workflow run return value is the recoverable terminal source of truth.

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

### Agent and workflow

`chatTurnWorkflow(turnRef, messages, catalog)` is a `'use workflow'` function running one `WorkflowAgent` with:

- `instructions` from config (system-in-messages stays rejected — default flag untouched);
- `model` via `assertModelInstance`; `tools`: server tools now, Steps 11/12 add more;
- `stopWhen: isStepCount(settings.agent.stopWhenSteps)`; `maxRetries: 0`; the explicit turn timeout and signal-based cancellation via the durable abort hook proven in Step 02 (the realm patch module must be loaded in the workflow bundle before `agent.stream`);
- `writable: getWritable<ModelCallStreamPart>()`;
- the workflow resolves exactly one JSON-safe terminal outcome containing assistant text, usage, cancellation, or a safe failure code;
- the application projects that durable outcome idempotently through the Step 09 ports and releases admission only after projection. Step 05 uses the temporary in-memory adapter and records this stand-in explicitly.

### Stream response

POST responds with `createUIMessageStreamResponse` over `run.readable.pipeThrough(createModelCallToUIChunkTransform())`, with the Step 04 keepalive injected and `x-workflow-run-id`. The Step 06 scrub transform slots into this chain — leave a named seam (`outboundTransforms: []`).

### Cancellation

`POST /api/chat/:runId/cancel` always performs auth/ownership first and resumes the durable abort hook proven in Step 02 so an `AbortSignal` reaches the active `WorkflowAgent.stream` provider call; `run.cancel()` delivers no abort to the provider and is not the mechanism. It then persists a clean cancelled terminal. The abort path must fail the step with a `DOMException` named `AbortError` — any other error is retryable to the engine and re-runs the aborted provider call (Step 02 engine finding). The test must observe provider abort directly—run status alone is not proof—assert exactly one provider attempt, and reject all later content.

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
npm test -- apps/side-chat-service/src/adapters/http
npm test -- apps/side-chat-service/src/workflows
npm run typecheck
npm run lint:custom
rg -n "allowSystemInMessages|fullStream" apps/side-chat-service
```

The `rg` must return zero.

## Completion checklist

- [x] POST + cancel routes with the load-bearing order; WorkflowAgent construction.
- [x] All 8 edge cases tested with mock providers, plus a durable provider-timeout case.
- [x] Admission seam + outbound-transform seam named and typed.
- [x] Workflow outcome guarantee: every run resolves one journaled terminal result; the application projects it idempotently before releasing admission.
- [x] Old app untouched.

## Handoff record

Final routes and modules: `adapters/http/chat/chat-routes.ts`; `application/turn/execution/{prepare-turn,run-turn}.ts`; `application/turn/finalization/finalize-turn.ts`; `composition/turn/workflow-turn-execution.ts`; `workflows/production/chat-turn.ts`.

Cancel-before-first-chunk invariant evidence: compiled compatibility suite observes provider abort, exactly one attempt, no late content, no empty assistant message, and admission release.

Stand-ins used for Step 09 interfaces (if any): `adapters/persistence/in-memory-turn-state.ts` implements the application-owned conversation, message, and turn ports. The Workflow journaled return value remains the recoverable terminal source; Step 09 replaces only the projection adapter.
