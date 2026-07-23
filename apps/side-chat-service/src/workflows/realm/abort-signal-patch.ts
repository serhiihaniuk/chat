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
 * realm's real `AbortSignal` class from the prototype of a signal created here,
 * while retaining the runtime's working `abort`, `any`, and `timeout` statics.
 *
 * Remove this module once either upstream exposes the real class or the SDK stops
 * relying on `instanceof`. The unpatched probe in
 * `service-compatibility.integration.test.ts` is the removal signal: it must
 * change from throwing before this repair can be deleted.
 */
export function patchWorkflowRealmAbortSignal(signal: AbortSignal): void {
  const signalPrototype = Reflect.getPrototypeOf(signal);
  if (signalPrototype === null) return;
  const signalConstructor = signalPrototype.constructor;
  const runtimeAbortSignal = globalThis.AbortSignal;
  Object.assign(signalConstructor, {
    abort: (reason?: unknown) => runtimeAbortSignal.abort(reason),
    any: (signals: AbortSignal[]) => runtimeAbortSignal.any(signals),
    timeout: (milliseconds: number) => runtimeAbortSignal.timeout(milliseconds),
  });
  Object.assign(globalThis, { AbortSignal: signalConstructor });
}
