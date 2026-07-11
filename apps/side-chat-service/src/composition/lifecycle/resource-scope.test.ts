import { describe, expect, it } from "vitest";

import { validateSettings } from "#config/settings/resolve-settings";
import { createDefaultConfig } from "#config/settings/settings.test-fixture";

import { startTestingService } from "../route/testing.js";

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
});

function validSettings() {
  const result = validateSettings(createDefaultConfig());
  if (!result.ok) throw new Error("Test fixture must resolve");
  return result.settings;
}
