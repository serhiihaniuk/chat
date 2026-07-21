import { describe, expect, it, vi } from "vitest";

import { withWorkflowStepStore } from "./workflow-step-store.js";

describe("withWorkflowStepStore", () => {
  it("closes the step store after successful work", async () => {
    const close = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const result = await withWorkflowStepStore(
      "postgres://workflow-step",
      () => ({ close }),
      () => Promise.resolve("result"),
    );

    expect(result).toBe("result");
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the step store after failed work", async () => {
    const close = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const failure = new Error("step failed");

    await expect(
      withWorkflowStepStore(
        "postgres://workflow-step",
        () => ({ close }),
        () => Promise.reject(failure),
      ),
    ).rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
  });
});
