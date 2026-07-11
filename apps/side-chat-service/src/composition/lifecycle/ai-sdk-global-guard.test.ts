import { describe, expect, it } from "vitest";

import { assertAiSdkDefaultProviderIsUnset, ServiceStartupError } from "./ai-sdk-global-guard.js";

describe("assertAiSdkDefaultProviderIsUnset", () => {
  it("fails closed when an AI SDK global provider is configured", () => {
    const previous = globalThis.AI_SDK_DEFAULT_PROVIDER;
    try {
      Reflect.set(globalThis, "AI_SDK_DEFAULT_PROVIDER", {});
      expect(() => assertAiSdkDefaultProviderIsUnset()).toThrowError(ServiceStartupError);
    } finally {
      Reflect.set(globalThis, "AI_SDK_DEFAULT_PROVIDER", previous);
    }
  });
});
