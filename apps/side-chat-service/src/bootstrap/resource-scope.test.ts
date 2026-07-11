import { describe, expect, it } from "vitest";

import { validateSettings } from "#application/configuration/resolve-settings";
import {
  initializeWorkflowServices,
  workflowServices,
} from "#adapters/outbound/workflow/workflow-service-registry";
import { startTestingService } from "#bootstrap/compositions/testing";
import { createDefaultConfig } from "#application/configuration/settings.test-fixture";

describe("service composition", () => {
  it("disposes partial acquisitions in reverse order", async () => {
    const events: string[] = [];
    const settings = validSettings();

    await expect(
      startTestingService(settings, [
        () => ({ name: "worker", close: () => void events.push("worker:closed") }),
        () => ({ name: "pool", close: () => void events.push("pool:closed") }),
        () => {
          throw new Error("listener failed");
        },
      ]),
    ).rejects.toThrow("listener failed");
    expect(events).toEqual(["pool:closed", "worker:closed"]);
  });

  it("rejects workflow service use before initialization and resets on disposal", async () => {
    expect(() => workflowServices()).toThrow("before composition initialized");
    initializeWorkflowServices({ composition: "testing" });
    const service = await startTestingService(validSettings());
    expect(workflowServices().composition).toBe("testing");

    await service.scope.close();

    expect(() => workflowServices()).toThrow("before composition initialized");
  });
});

function validSettings() {
  const result = validateSettings(createDefaultConfig());
  if (!result.ok) throw new Error("Test fixture must resolve");
  return result.settings;
}
