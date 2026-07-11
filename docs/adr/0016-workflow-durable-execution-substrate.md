# ADR 0016: Adopt the Workflow Durable Execution Substrate with a Pinned Compatibility Patch

Status: accepted 2026-07-11 (revised the same day: supersedes this ADR's own interim fallback decision after a re-examination with new evidence)

Supersedes: ADR 0007 (connection-bound streaming) and ADR 0008 (crash-recovery lease/sweep).

## Context

The service needs durable turn execution: an assistant answer must survive process crashes and deploys, be continuable by any instance, replay its stream to reconnecting clients, and support waits (client tools, human approvals) that outlive a request. The previous architecture approximated this with connection-bound in-memory streaming plus leases and a reaper: honest, but a crash lost the in-flight answer and cross-instance delivery required custom relay machinery.

WorkflowAgent (`@ai-sdk/workflow`) on the Workflow DevKit with the self-hosted Postgres World provides the stronger model natively: journaled agent steps, persisted reconnectable streams, durable hooks, crash recovery, and continuation by any worker. Adopting it deletes the custom lease/reaper, event registry, notification relay, and recovery-ladder designs.

## Decision history (both verdicts, both evidenced)

**First gate (early 2026-07-11):** the compatibility gate found that cancellation could not reach an in-flight provider call inside a workflow: Workflow 4.6's VM lacks `AbortSignal`; a Workflow 5 beta signal failed AI SDK's `instanceof AbortSignal` check. The gate selected a request-bound `ToolLoopAgent` fallback and the Workflow code was deleted. The finding was correct; the original evidence document was subsequently lost in an interrupted cleanup.

**Re-examination (later 2026-07-11):** a from-scratch reproduction on the newest versions (`workflow@5.0.0-beta.30`, `ai@7.0.22`, `@ai-sdk/workflow@1.0.22`) re-established the evidence and overturned the first verdict's conclusion:

- Out of the box, ANY `abortSignal` or numeric `timeout` passed to `WorkflowAgent.stream` throws `TypeError: Right-hand side of 'instanceof' is not callable` before the provider is called.
- The root cause is a name-lookup bug, not broken semantics: the workflow VM's `AbortSignal` global is a plain object (`vercel/workflow` `packages/core/src/workflow.ts:383`) and AI SDK's `mergeAbortSignals` uses `instanceof` (`vercel/ai` `packages/ai/src/util/merge-abort-signals.ts:17`). Either side's one-line fix resolves it.
- The DevKit's own v5 cancellation machinery is proven correct: a durable workflow-realm `AbortController` aborts an in-flight host-side step in real time.
- A one-line in-workflow patch (`globalThis.AbortSignal = Object.getPrototypeOf(controller.signal).constructor;`) makes the full documented cancellation pattern work end-to-end: abort delivered to a blocked provider in ~2 ms with the reason intact.
- `run.cancel()` is confirmed insufficient: it transitions run status but delivers no abort to an in-flight provider call. Cancellation must be signal-based.

Full evidence and reproduction: `plan/v7/evidence/02-workflow-cancellation-reexamination.md`; preserved repro at `.reference/workflow-cancel-repro` (v5) and `.reference/workflow-cancel-repro-v4` (v4 control).

## Decision

Adopt **WorkflowAgent + Workflow DevKit + `@workflow/world-postgres`** as the execution substrate, at pinned exact versions, with the one-line realm patch isolated in a single documented module.

The patch is acceptable where a compatibility bridge would not be, because it repairs a name lookup over semantics that are independently proven correct; it hides no behavior. Its guardrails:

- it lives in one module whose doc comment carries the root cause, the evidence link, and the removal criterion;
- the permanent compatibility suite includes a test proving the patch is still load-bearing (the unpatched path throws); when a dependency bump makes the unpatched path work, that test flips and the patch is deleted in the same change;
- versions are pinned exactly; upgrades re-run the suite before adoption.

Cancellation is signal-based: a durable abort hook raced with the agent call; the cancel route resumes the hook; provider abort is asserted directly in tests. `run.cancel()` is not the cancellation mechanism.

## Acceptance invariants (unchanged from the gate; permanently tested)

1. pinned Workflow/Nitro code builds, boots, and repeatedly completes a streamed turn;
2. a hard owner-process crash recovers the run to terminal without a new user request;
3. a second instance can continue and serve a run created by the first through shared Postgres state;
4. replay plus live tail normalizes to one coherent client message and terminal;
5. cancellation delivers an abort into the active provider call, stops provider work promptly, and persists a coherent cancelled terminal — observed at the provider, not inferred from run status.

## Consequences

- Crash-resume, cross-instance continuation, durable waits, and stream replay become native capabilities; the custom lease/reaper, event registry, relay, and recovery-ladder designs are permanently retired.
- The service build adopts the Nitro workflow compiler; the Postgres World adds workflow tables (own schema) and a worker to operate.
- Steps may execute more than once (at-least-once semantics); mutating tools require idempotency keys.
- Self-hosted deploys need drain discipline until an upstream deploy-versioning story exists; workflow function shapes must stay replay-compatible across deploys.
- The interim `ToolLoopAgent` fallback remains recorded here and in the gate history as the contingency that briefly ran; exactly one substrate ships, with no parallel implementations behind a port.
- Accepted risks: the patch mutates a sandbox global on a beta release train (bounded by exact pins plus the load-bearing test); upstream-issue material for both one-line fixes is drafted in the evidence file (filing requires user approval).
- Remaining incomplete upstream area tracked separately: WorkflowAgent's compiled-path `needsApproval` gap (see the approvals plan step), which the approval design must gate on its own durable execution barrier until upstream proves otherwise.

## Implementation findings (2026-07-11 rebuild; permanently tested in the compatibility suite)

- **Abort-path errors must be a `DOMException` named `AbortError`.** The engine treats a step failing with any other value as retryable and re-runs the aborted provider call (observed: three re-executions of a cancelled model call). Real providers throw `AbortError`; scripted providers and adapters must too. The suite pins "exactly one provider attempt" on cancellation.
- **A pending, never-resumed `createHook` does not block run completion** — the always-armed cancellation hook is safe; completed turns do not hang on it.
- The route bundle and the workflow step bundle are **separate module instances** under the Nitro workflow build; state cannot be shared between them via module scope. Composition patterns that assume one shared module graph must account for this boundary.
- Production world selection (`WORKFLOW_TARGET_WORLD`) is a **build-time** choice (esbuild alias), not a runtime switch; `WORKFLOW_POSTGRES_URL` remains the runtime secret. Tests run on the embedded local world with a disposable data directory.
