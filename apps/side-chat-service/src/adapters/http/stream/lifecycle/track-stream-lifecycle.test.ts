import { describe, expect, it, vi } from "vitest";

import { trackStreamLifecycle } from "./track-stream-lifecycle.js";

describe("trackStreamLifecycle", () => {
  it("releases after stream completion", async () => {
    const release = vi.fn<() => void>();
    const tracked = trackStreamLifecycle(
      new ReadableStream({ start: (controller) => controller.close() }),
      release,
    );

    await tracked.getReader().read();

    expect(release).toHaveBeenCalledOnce();
  });

  it("releases after stream cancellation", async () => {
    const release = vi.fn<() => void>();
    const tracked = trackStreamLifecycle(new ReadableStream(), release);

    await tracked.cancel();

    expect(release).toHaveBeenCalledOnce();
  });

  it("releases after stream failure", async () => {
    const release = vi.fn<() => void>();
    const tracked = trackStreamLifecycle(
      new ReadableStream({
        start: (controller) => controller.error(new Error("stream failed")),
      }),
      release,
    );

    await expect(tracked.getReader().read()).rejects.toThrow("stream failed");
    expect(release).toHaveBeenCalledOnce();
  });
});
