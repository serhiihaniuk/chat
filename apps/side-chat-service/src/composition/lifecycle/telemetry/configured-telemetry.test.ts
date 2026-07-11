import type { Telemetry } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SideChatConfig } from "#config/declaration/side-chat-config";
import { validateSettings } from "#config/settings/resolve-settings";
import { createDefaultConfig } from "#config/settings/settings.test-fixture";

import { startConfiguredTelemetry, type OtlpTelemetryLoader } from "./configured-telemetry.js";

describe("configured telemetry lifecycle", () => {
  let previous: typeof globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;

  beforeEach(() => {
    previous = globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
  });
  afterEach(() => {
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = previous;
  });

  it("boots without loading optional exporter packages when OTLP is not selected", async () => {
    const unavailableExporter = vi.fn<OtlpTelemetryLoader>(() =>
      Promise.reject(new Error("exporter absent")),
    );
    const part = await startConfiguredTelemetry(testSettings({ mode: "off" }), unavailableExporter);

    expect(unavailableExporter).not.toHaveBeenCalled();
    await part.close();
  });

  it("registers and closes the isolated OTLP integration when selected", async () => {
    const close = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const integration: Telemetry = {};
    const loadExporter = vi.fn<OtlpTelemetryLoader>(() => Promise.resolve({ integration, close }));
    const settings = testSettings({
      mode: "otlp",
      endpoint: "http://collector.test/v1/traces",
      serviceName: "side-chat-test",
    });

    const part = await startConfiguredTelemetry(settings, loadExporter);
    expect(loadExporter).toHaveBeenCalledWith(settings.telemetry);
    expect(globalThis.AI_SDK_TELEMETRY_INTEGRATIONS).toContain(integration);
    await part.close();
    expect(close).toHaveBeenCalledOnce();
  });
});

function testSettings(telemetry: SideChatConfig["telemetry"]) {
  const result = validateSettings(createDefaultConfig({ telemetry }));
  if (!result.ok) throw new Error("Telemetry test settings must be valid");
  return result.settings;
}
