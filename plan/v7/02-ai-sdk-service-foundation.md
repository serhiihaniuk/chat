# Step 02: AI SDK 7 Service Foundation

Read this when: building on, verifying, or upgrading the greenfield service foundation, or reviewing how the execution substrate was decided.

Source of truth for: the step-02 history (both gate passes), the implemented WorkflowAgent/Nitro foundation, the realm patch and its removal criterion, the permanent compatibility suite, and the package boundary.

Not source of truth for: production configuration (Step 03), providers/auth/telemetry (Step 04), or turn policy (Step 05). The substrate decision itself is owned by [ADR 0016](../../docs/adr/0016-workflow-durable-execution-substrate.md) and the verdict section of [`STATUS.md`](./STATUS.md).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 01. Unblocks: Step 03.

## Outcome (implemented 2026-07-11, all green)

`apps/side-chat-service` is the production-shaped AI SDK 7 wing on the Workflow DevKit substrate: a Nitro app (`nitro build`/`nitro dev`, module `workflow/nitro`) routing everything except the workflow engine's `/.well-known/workflow/v1/*` endpoints into a Hono app. One turn is one durable `'use workflow'` run executing a `WorkflowAgent`. It builds and boots without the old Effect application, streams a native UI message response with a credential-free scripted provider, and delivers signal-based cancellation into the in-flight provider call.

`.reference/ai-sdk-v7` and `.reference/workflow` remain ignored upstream source references. Their presence does not authorize adoption of further upstream subsystems.

## How this step went (the two gate passes)

This step originally existed as two files (02a retained foundation, 02b compatibility gate); both were replaced by this record after the substrate reversal.

1. **First gate (early 2026-07-11):** the foundation was built on Workflow and the gate found cancellation could not reach an in-flight provider call inside a workflow (Workflow 4.6's VM lacks `AbortSignal`; a Workflow 5 beta signal failed AI SDK's `instanceof AbortSignal` check). A request-bound `ToolLoopAgent` fallback was selected and the Workflow code was deleted. The finding was correct, but the original evidence document was lost in an interrupted plan cleanup.
2. **Re-examination (later 2026-07-11):** [`evidence/02-workflow-cancellation-reexamination.md`](./evidence/02-workflow-cancellation-reexamination.md) rebuilt the evidence from scratch on the newest versions: out of the box still broken, but the root cause is a one-line name-lookup bug (workflow VM's `AbortSignal` global is a plain object; AI SDK's `mergeAbortSignals` uses `instanceof`), while the DevKit's v5 cancellation semantics are proven correct end-to-end. A one-line in-workflow patch makes the docs-blessed cancellation pattern work (~2 ms abort delivery, reason intact). `run.cancel()` was confirmed to deliver zero abort events to a provider.
3. **User decision:** adopt Workflow with the pinned realm patch (ADR 0016 revised to this outcome). Rationale: the adopt-with-patch and wait-for-upstream paths converge, minus the idle time; the durability features (crash-resume, multi-instance continuation, durable waits, replay) are product-owner-required.
4. **Rebuild:** the WorkflowAgent + Nitro foundation was rebuilt the same day and verified green; the interim `ToolLoopAgent` fallback code was deleted per the one-substrate rule.

## Implemented architecture

- HTTP: `hono`, served through the Nitro build (`nitro.config.ts`, module `workflow/nitro`); scripts `build: nitro build`, `dev: nitro dev`, `start: node .output/server/index.mjs`.
- Agent: `WorkflowAgent` (`@ai-sdk/workflow`) inside a `'use workflow'` compatibility turn (`src/workflows/testing/compatibility-turn.ts`).
- Patch module: `src/workflows/abort-signal-patch.ts` restores a constructable `AbortSignal` global inside the workflow realm (written as `Reflect.getPrototypeOf(signal)` + `Object.assign(globalThis, { AbortSignal: … })` because repo gates forbid type assertions; semantically the proven one-liner). Its header carries the root cause, the evidence link, and the removal criterion.
- Cancellation: signal-based — a durable abort hook raced with `WorkflowAgent.stream`; the cancel route resumes the hook; the workflow-realm `AbortController` aborts the provider call. `run.cancel()` is not a mechanism and no `run.cancel()` route exists.
- Test provider: credential-free scripted model (`src/testing/scripted-language-model.ts`) implementing `WORKFLOW_SERIALIZE`/`WORKFLOW_DESERIALIZE` from `@workflow/serde` so it crosses the workflow→step boundary.
- Worlds: dev and the compatibility suite run the embedded local world with a disposable `WORKFLOW_LOCAL_DATA_DIR`; production builds select `@workflow/world-postgres` via the build-time `WORKFLOW_TARGET_WORLD` esbuild alias, with `WORKFLOW_POSTGRES_URL` as the runtime secret.
- Pins (exact): `ai@7.0.22`, `@ai-sdk/workflow@1.0.22`, `workflow@5.0.0-beta.30`, `@ai-sdk/provider@4.0.3`, `@workflow/serde@5.0.0-beta.2`, `@workflow/world-postgres@5.0.0-beta.24`, `nitro@3.0.260610-beta`, `rollup@4.62.2`, `hono@4.12.27`; `zod` deliberately undeclared (auto peer; root pins it).
- Boundaries: no import from the old app, Effect runtime, provider credentials, or browser packages; `.nitro/`, `.output/`, `.workflow-data/` gitignored and governance-ignored.

## Engine constraints recorded for later steps

- **AbortError naming:** a step failing with anything other than a `DOMException` named `AbortError` is treated as retryable and re-runs the provider call. Abort paths must preserve that name.
- **Pending hooks are safe:** a never-resumed `createHook` does not block run completion — the always-armed cancellation hook is safe.
- **Bundle isolation:** the route bundle and the workflow step bundle are separate module instances under the Nitro workflow build; no module-scope state sharing crosses that boundary.
- **At-least-once steps:** journaled steps may re-run; mutating tools need idempotency keys (Steps 09/11/12 own the concrete keys).

## Permanent compatibility suite (3/3 green on the compiled Nitro output)

`src/composition/route/service-compatibility.integration.test.ts`, run by `npm run test:service:compatibility`:

1. boots the compiled service on an ephemeral port and completes a native WorkflowAgent UI message stream (text framing, `finish`, `[DONE]`);
2. delivers hook cancellation to the in-flight provider call — provider-observed abort, zero late content, exactly one provider attempt;
3. **patch-removal tripwire:** proves the realm patch is load-bearing by asserting the unpatched path still throws the `instanceof` TypeError. When a dependency bump makes this test flip, the upstream fix has shipped and the patch is deleted in the same change.

The suite owns and releases its child process, port, and disposable world data directory, and re-runs on every Workflow/AI SDK dependency bump.

## Verification

```powershell
npm run test:service:compatibility
npm run typecheck
npm run build
npm run lint:custom
```

## Completion checklist

- [x] Nitro/Hono Workflow service builds and boots (compiled output, not just dev mode).
- [x] WorkflowAgent native stream completes without credentials (serde-capable scripted model).
- [x] Signal-based cancellation: provider abort observed directly; no late content; exactly one provider attempt.
- [x] Realm patch isolated in one documented module with the tripwire test guarding its removal criterion.
- [x] Dependency and runtime-boundary governance include the new service; pins exact.
- [x] Interim fallback code deleted; exactly one substrate ships.

## Handoff record

Service workspace: `apps/side-chat-service` (Nitro entry `nitro.config.ts`; Hono app created under `src/adapters/http`, exported via `src/index.ts`)

Turn workflow: `apps/side-chat-service/src/workflows/testing/compatibility-turn.ts`

Patch module: `apps/side-chat-service/src/workflows/abort-signal-patch.ts`

Scripted model: `apps/side-chat-service/src/testing/scripted-language-model.ts`

Permanent suite: `apps/side-chat-service/src/composition/route/service-compatibility.integration.test.ts` (verified command: `npm run test:service:compatibility`, 3/3)

Decision and findings recorded in: ADR 0016 (revised), `KNOWLEDGE.md` §2026-07-11 cancellation re-examination and §2026-07-11 foundation rebuild facts, `evidence/02-workflow-cancellation-reexamination.md`
