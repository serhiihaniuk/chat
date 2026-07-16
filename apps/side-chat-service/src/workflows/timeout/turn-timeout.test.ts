import { describe, expect, it, vi } from "vitest";

import type { WorkflowClock } from "../clock/workflow-clock.js";
import { createSuspendableTurnTimeout } from "./turn-timeout.js";

describe("suspendable turn timeout", () => {
  it("does not elapse while a durable wait is suspended", async () => {
    const { clock, waits } = controlledClock();
    const timeout = createSuspendableTurnTimeout(10, clock);
    const waiting = timeout.waitUntilElapsed();
    expect(waits).toHaveLength(1);

    const suspension = timeout.suspend();
    waits[0]?.();
    await Promise.resolve();
    expect(waits).toHaveLength(1);

    suspension.release();
    await vi.waitFor(() => expect(waits).toHaveLength(2));
    waits[1]?.();
    await expect(waiting).resolves.toBeUndefined();
  });

  it("waits for every parallel approval before restarting the deadline", async () => {
    const { clock, waits } = controlledClock();
    const timeout = createSuspendableTurnTimeout(10, clock);
    const first = timeout.suspend();
    const second = timeout.suspend();
    const waiting = timeout.waitUntilElapsed();
    expect(waits).toHaveLength(0);

    first.release();
    await Promise.resolve();
    expect(waits).toHaveLength(0);
    second.release();
    await Promise.resolve();
    expect(waits).toHaveLength(1);
    waits[0]?.();
    await expect(waiting).resolves.toBeUndefined();
  });
});

function controlledClock(): Readonly<{
  clock: WorkflowClock;
  waits: Array<() => void>;
}> {
  const waits: Array<() => void> = [];
  return {
    waits,
    clock: {
      now: () => 0,
      wait: () =>
        new Promise<void>((resolve) => {
          waits.push(resolve);
        }),
    },
  };
}
