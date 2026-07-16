import { WORKFLOW_CLOCK, type WorkflowClock } from "../clock/workflow-clock.js";

const TIMEOUT_WAIT = {
  ELAPSED: "elapsed",
  ACTIVITY_CHANGED: "activity_changed",
} as const;

export type TurnTimeoutSuspension = Readonly<{ release: () => void }>;

export interface SuspendableTurnTimeout {
  suspend(): TurnTimeoutSuspension;
  waitUntilElapsed(): Promise<void>;
}

/**
 * Counts only active provider phases. A durable tool approval suspends the ordinary
 * provider deadline; releasing the final suspension starts a fresh model-call
 * window before the agent continues.
 */
export function createSuspendableTurnTimeout(
  timeoutMs: number,
  clock: WorkflowClock = WORKFLOW_CLOCK,
): SuspendableTurnTimeout {
  let suspensionCount = 0;
  let change = deferredChange();

  const notifyChange = () => {
    change.resolve();
    change = deferredChange();
  };

  return {
    suspend() {
      suspensionCount += 1;
      notifyChange();
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          suspensionCount -= 1;
          notifyChange();
        },
      };
    },
    async waitUntilElapsed() {
      for (;;) {
        while (suspensionCount > 0) await change.promise;
        const outcome = await Promise.race([
          clock.wait(timeoutMs).then(() => TIMEOUT_WAIT.ELAPSED),
          change.promise.then(() => TIMEOUT_WAIT.ACTIVITY_CHANGED),
        ]);
        if (outcome === TIMEOUT_WAIT.ELAPSED && suspensionCount === 0) return;
      }
    },
  };
}

function deferredChange(): Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}> {
  let resolveChange: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolveChange = resolve;
  });
  return {
    promise,
    resolve: () => resolveChange?.(),
  };
}
