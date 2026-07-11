/**
 * Workflow-realm `AbortSignal` global repair. This is the single compatibility
 * patch that the execution-substrate decision allows; no other file may mutate
 * a global.
 *
 * Root cause (both sides Vercel's, verified at the pinned versions):
 * - vercel/workflow `packages/core/src/workflow.ts:383` assigns a plain object
 *   `{abort, any, timeout}` as the workflow VM's `AbortSignal` global, so any
 *   `x instanceof AbortSignal` inside workflow-realm code throws
 *   `TypeError: Right-hand side of 'instanceof' is not callable`.
 * - vercel/ai `packages/ai/src/util/merge-abort-signals.ts:17` evaluates
 *   exactly that check inside `WorkflowAgent.stream`, so passing any
 *   `abortSignal` (or numeric `timeout`) fails before the provider is called.
 *
 * The repair replaces the VM global with the realm's real `WorkflowAbortSignal`
 * class, taken from the prototype of a signal created in this realm. It is the
 * lint-clean equivalent of the proven one-liner
 * `globalThis.AbortSignal = Object.getPrototypeOf(controller.signal).constructor;`.
 *
 * Evidence: plan/v7/evidence/02-workflow-cancellation-reexamination.md
 * (experiment W: with this patch the docs-blessed durable cancellation pattern
 * works end-to-end; abort reaches a blocked provider in ~2 ms with the reason
 * intact).
 *
 * Removal criterion: delete this module when either upstream one-line fix
 * ships (workflow exposing the real class as the VM global, or the AI SDK
 * duck-typing instead of `instanceof`). The compatibility suite's
 * "unpatched probe" test re-runs on every dependency bump and flips from
 * "throws" to "streams" exactly when that happens.
 */
export function patchWorkflowRealmAbortSignal(signal: AbortSignal): void {
  const signalPrototype = Reflect.getPrototypeOf(signal);
  if (signalPrototype === null) return;
  Object.assign(globalThis, { AbortSignal: signalPrototype.constructor });
}
