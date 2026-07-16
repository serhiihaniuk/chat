import { describe, expect, it } from "vitest";

import { ActiveStreamRegistry } from "./active-stream-registry.js";

describe("ActiveStreamRegistry", () => {
  it("cancels active streams once and rejects later registrations", async () => {
    let cancellations = 0;
    const registry = new ActiveStreamRegistry();
    const tracked = registry.track(
      new ReadableStream<Uint8Array>({
        cancel: () => void (cancellations += 1),
      }),
    );
    const reader = tracked.getReader();

    const firstShutdown = registry.shutdown();
    const secondShutdown = registry.shutdown();
    await Promise.all([firstShutdown, secondShutdown]);

    expect(cancellations).toBe(1);
    expect(registry.snapshot()).toEqual({ active: 0, accepting: false });
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });

    const late = registry.track(new ReadableStream<Uint8Array>());
    await expect(late.getReader().read()).resolves.toEqual({ done: true, value: undefined });
  });

  it("releases naturally completed and client-cancelled streams", async () => {
    const registry = new ActiveStreamRegistry();
    const completed = registry.track(
      new ReadableStream<string>({
        start: (controller) => {
          controller.enqueue("done");
          controller.close();
        },
      }),
    );
    expect(await completed.getReader().read()).toEqual({ done: false, value: "done" });

    const cancelled = registry.track(new ReadableStream<string>());
    await cancelled.cancel();
    await registry.shutdown();

    expect(registry.snapshot().active).toBe(0);
  });
});
