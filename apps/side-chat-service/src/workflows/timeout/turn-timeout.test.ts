import { beforeEach, describe, expect, it, vi } from "vitest";

const { sleeps } = vi.hoisted((): { sleeps: Array<() => void> } => ({ sleeps: [] }));

vi.mock("workflow", () => ({
  sleep: () =>
    new Promise<void>((resolve) => {
      sleeps.push(resolve);
    }),
}));

import { createSuspendableTurnTimeout } from "./turn-timeout.js";

describe("suspendable turn timeout", () => {
  beforeEach(() => {
    sleeps.length = 0;
  });

  it("does not elapse while a durable wait is suspended", async () => {
    const timeout = createSuspendableTurnTimeout(10);
    const waiting = timeout.waitUntilElapsed();
    expect(sleeps).toHaveLength(1);

    const suspension = timeout.suspend();
    sleeps[0]?.();
    await Promise.resolve();
    expect(sleeps).toHaveLength(1);

    suspension.release();
    await vi.waitFor(() => expect(sleeps).toHaveLength(2));
    sleeps[1]?.();
    await expect(waiting).resolves.toBeUndefined();
  });

  it("waits for every parallel approval before restarting the deadline", async () => {
    const timeout = createSuspendableTurnTimeout(10);
    const first = timeout.suspend();
    const second = timeout.suspend();
    const waiting = timeout.waitUntilElapsed();
    expect(sleeps).toHaveLength(0);

    first.release();
    await Promise.resolve();
    expect(sleeps).toHaveLength(0);
    second.release();
    await Promise.resolve();
    expect(sleeps).toHaveLength(1);
    sleeps[0]?.();
    await expect(waiting).resolves.toBeUndefined();
  });
});
