/**
 * Workflow-realm `AbortSignal` global repair, and the only global mutation the
 * execution-substrate decision permits.
 *
 * At the pinned versions vercel/workflow installs a plain `{abort, any, timeout}`
 * object as the workflow VM's `AbortSignal` global (`workflow.ts:383`), so every
 * `x instanceof AbortSignal` in the realm throws `TypeError: Right-hand side of
 * 'instanceof' is not callable`. vercel/ai runs exactly that check inside
 * `WorkflowAgent.stream` (`merge-abort-signals.ts:17`), so any `abortSignal` or
 * numeric `timeout` fails before the provider is reached. The repair restores the
 * realm's real `AbortSignal` class from the prototype of a signal created here.
 *
 * Evidence: plan/v7/evidence/02-workflow-cancellation-reexamination.md. Remove this
 * module once either upstream ships its one-line fix (the VM exposing the real
 * class, or the SDK duck-typing instead of `instanceof`); the compatibility suite's
 * unpatched probe flips from "throws" to "streams" exactly then.
 */
export function patchWorkflowRealmAbortSignal(signal: AbortSignal): void {
  const signalPrototype = Reflect.getPrototypeOf(signal);
  if (signalPrototype === null) return;
  Object.assign(globalThis, { AbortSignal: signalPrototype.constructor });
}
