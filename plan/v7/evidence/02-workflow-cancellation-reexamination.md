# Workflow Cancellation Re-Examination — 2026-07-11

Read this when: deciding or reviewing the execution-substrate verdict, or re-running the reproduction.

Source of truth for: the verified cancellation behavior of WorkflowAgent on current package versions, the exact root cause, the proven workaround, and the upstream-issue material.

Context: the original Step 02b evidence document was deleted during an interrupted plan cleanup. This re-examination was run from scratch on the newest published versions to restore reproducible evidence and to answer the product owner's requirement that the durability features (crash-resume, multi-instance continuation, durable waits, engine replay) are needed.

## Verdict

**Out of the box: still broken — and harder than previously recorded.** On `workflow@5.0.0-beta.30` + `ai@7.0.22` + `@ai-sdk/workflow@1.0.22`, passing ANY `abortSignal` (or numeric `timeout`) to `WorkflowAgent.stream` inside a workflow throws `TypeError: Right-hand side of 'instanceof' is not callable` immediately — before the provider is ever called.

**Architecturally: NOT broken.** The Workflow DevKit's own v5 cancellation machinery works correctly (durable AbortController → real-time abort observed inside an in-flight host-side step). The entire failure is one name-lookup bug: the workflow VM's `AbortSignal` global is a plain object, so AI SDK's `instanceof AbortSignal` check throws. A one-line in-workflow patch makes the full docs-blessed cancellation pattern work end-to-end: abort reached a blocked provider in ~2 ms with the abort reason intact.

## Root cause (exact locations, both sides Vercel's)

- **vercel/workflow** — `packages/core/src/workflow.ts:383` (verified at the 5.0.0-beta.30 clone): the VM's `AbortSignal` global is assigned a plain object `{abort, any, timeout}` with no constructor and no `Symbol.hasInstance`, so any `x instanceof AbortSignal` in workflow-realm code throws.
- **vercel/ai** — `packages/ai/src/util/merge-abort-signals.ts:17`: `signal instanceof AbortSignal ? signal : AbortSignal.timeout(signal)`, called from `WorkflowAgent.stream` (`packages/workflow/src/workflow-agent.ts:1750`), which executes in the workflow VM realm.

Either side's one-line fix resolves it: workflow exposing the real `WorkflowAbortSignal` class (or adding `Symbol.hasInstance`) as the global, or AI SDK duck-typing (`typeof signal === 'number'`) instead of `instanceof`.

## Experiment results (all reproducible)

| #   | Experiment                                                                                                                                 | Result                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Docs-blessed v5 pattern: workflow-realm `AbortController` + `createHook` + `Promise.race`, signal → `agent.stream({abortSignal})`          | `TypeError … instanceof is not callable` at `mergeAbortSignals`; provider never called                                                                                                                                |
| T   | Numeric `timeout: 3000`                                                                                                                    | identical TypeError (the number hits the `instanceof` check first)                                                                                                                                                    |
| B2  | Host-created `AbortController` passed as workflow input                                                                                    | DevKit correctly deserializes it into a `WorkflowAbortSignal` in the VM (realm-crossing is SOLVED in v5) — then the identical TypeError                                                                               |
| C   | DevKit-only control (no AI SDK): workflow signal → plain `'use step'`                                                                      | arrives as a REAL native host `AbortSignal`; hook-triggered abort observed in the step in real time; workflow returned `"aborted"` — **DevKit v5 cancellation works**                                                 |
| E   | `run.cancel()` vs in-flight provider call                                                                                                  | status → `cancelled`, but the blocked provider observed ZERO abort events (documented behavior; not a substitute for signal-based stop)                                                                               |
| W   | One-line patch inside the workflow before `agent.stream`: `globalThis.AbortSignal = Object.getPrototypeOf(controller.signal).constructor;` | full docs pattern works end-to-end: provider received a native `AbortSignal`; abort delivered ~2 ms after hook resume; reason string intact; stream rejected `FatalError: Aborted`; race settled `cancelled-via-hook` |
| G   | VM globals audit (v5)                                                                                                                      | `typeof AbortController === 'function'` (WorkflowAbortController); `typeof AbortSignal === 'object'` (plain `{abort, any, timeout}`)                                                                                  |
| D   | `workflow@4.6.0` control                                                                                                                   | `ReferenceError: AbortController is not defined` / `AbortSignal is not defined` in the VM — confirms the original 02b finding for v4 exactly                                                                          |

Extra finding: a custom model instance crosses the workflow→step boundary only if it implements `WORKFLOW_SERIALIZE`/`WORKFLOW_DESERIALIZE` from `@workflow/serde`; a plain object with `doStream` fails with `[workflow-sdk] Serialization failed (context: step arguments)`.

## Reproduction

Preserved (source + logs, no node_modules) at:

- `.reference/workflow-cancel-repro` (v5; Hono + Nitro + local world; `npm install && npm run dev`, then POST the `/api/start-*` and cancel routes on port 3000; evidence lines: `grep "\[REPRO\]" devserver.log`; route table in its README)
- `.reference/workflow-cancel-repro-v4` (v4.6.0 control, port 3001)

Build environment: Node 24, Windows, zero build issues (22 steps / 6 workflows compiled by the Nitro module).

## Decision options (for the substrate verdict)

1. **Adopt Workflow now, pinned, with the one-line patch** isolated in one documented module, guarded by the permanent compatibility suite (breakage on any bump = failing test), with a recorded removal criterion (delete the patch when either upstream fix ships). Restores crash-resume, multi-instance, durable waits, and engine replay immediately. Risk: the patch mutates a sandbox global on a beta release train.
2. **Stay on the ToolLoopAgent fallback; file both upstream issues; re-run the gate on every bump.** Zero patch risk; the durability features return on upstream's clock; Steps 03–04 proceed either way (substrate-agnostic).

The original ADR 0008 rejection rationale ("fixing either path required compatibility code at a load-bearing cancellation boundary") is now qualified: cancellation semantics underneath are PROVEN correct; the patch fixes a name lookup, not behavior. Whether that distinction clears the no-compatibility-code rule is a product-owner decision, pending as of this document.

## Upstream-issue material (drafts; not yet filed — filing requires user approval)

1. **vercel/workflow**: "VM `AbortSignal` global is a plain object; any `instanceof AbortSignal` in workflow code throws — breaks `WorkflowAgent` (`@ai-sdk/workflow`) the moment `abortSignal` or `timeout` is passed, i.e. the v5 serializable-AbortController feature is unusable with the flagship AI SDK integration. Repro attached. Fix: expose the `WorkflowAbortSignal` class (with statics) as the global, or add `Symbol.hasInstance`. (`packages/core/src/workflow.ts:383`)"
2. **vercel/ai**: "`mergeAbortSignals` distinguishes signal-vs-number via `instanceof AbortSignal`, which throws in realm-constrained environments (Workflow VM). Duck-typing (`typeof signal === 'number'`) is realm-safe. (`packages/ai/src/util/merge-abort-signals.ts:17`)"
