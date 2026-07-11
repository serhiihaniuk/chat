import { describe, expect, it, vi } from "vitest";

import { validateSettings } from "#config/settings/resolve-settings";
import { createDefaultConfig } from "#config/settings/settings.test-fixture";

import { createWorkflowReadiness } from "./workflow-readiness.js";

describe("Workflow readiness", () => {
  it("passes the configured timeout through and reflects healthy/unhealthy probes", async () => {
    const settings = testSettings();
    const check = vi.fn<(timeoutMs: number) => Promise<boolean>>().mockResolvedValue(false);
    const readiness = createWorkflowReadiness(readyScope(), settings, { check });
    await expect(readiness.check()).resolves.toBe(false);
    expect(check).toHaveBeenCalledWith(settings.timeouts.queueMs);

    check.mockResolvedValue(true);
    await expect(readiness.check()).resolves.toBe(true);
  });

  it("fails closed on probe errors and after scope close", async () => {
    const settings = testSettings();
    const failingProbe = { check: () => Promise.reject(new Error("private infrastructure error")) };
    await expect(
      createWorkflowReadiness(readyScope(), settings, failingProbe).check(),
    ).resolves.toBe(false);

    const check = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const closedScope = { ...readyScope(), isReady: () => false };
    await expect(createWorkflowReadiness(closedScope, settings, { check }).check()).resolves.toBe(
      false,
    );
    expect(check).not.toHaveBeenCalled();
  });
});

function testSettings() {
  const result = validateSettings(createDefaultConfig());
  if (!result.ok) throw new Error("Default test settings must be valid");
  return result.settings;
}

function readyScope() {
  const settings = testSettings();
  return { settings, isReady: () => true, close: () => Promise.resolve() };
}
