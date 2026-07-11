import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCollectingTelemetrySink } from "#testing/collecting-telemetry-sink";

import { registerServiceTelemetry, TelemetryRegistrationError } from "./ai-sdk-telemetry.js";

describe("service telemetry registration", () => {
  let previous: typeof globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;

  beforeEach(() => {
    previous = globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
  });
  afterEach(() => {
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = previous;
  });

  it("records boot and rejects duplicate process registration", () => {
    const sink = createCollectingTelemetrySink();
    registerServiceTelemetry(sink);

    expect(sink.records).toEqual([{ type: "service.boot" }]);
    expect(() => registerServiceTelemetry(sink)).toThrowError(TelemetryRegistrationError);
  });
});
