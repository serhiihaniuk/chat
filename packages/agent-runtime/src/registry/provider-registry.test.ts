import { describe, expect, it } from "vitest";
import { AgentRuntimeError } from "../errors.js";
import {
  createFakeProvider,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
} from "../fake/fake-provider.js";
import { createProviderRegistry } from "./provider-registry.js";

describe("createProviderRegistry", () => {
  it("resolves an explicitly registered provider and model", () => {
    const provider = createFakeProvider();
    const registry = createProviderRegistry([provider]);

    expect(
      registry.resolve({
        providerId: FAKE_PROVIDER_ID,
        modelId: FAKE_ECHO_MODEL_ID,
      }),
    ).toBe(provider);
  });

  it("rejects unavailable providers without fallback", () => {
    const registry = createProviderRegistry([createFakeProvider()]);

    expect(() =>
      registry.resolve({ providerId: "missing", modelId: FAKE_ECHO_MODEL_ID }),
    ).toThrow(AgentRuntimeError);
  });

  it("rejects unavailable models without fallback", () => {
    const registry = createProviderRegistry([createFakeProvider()]);

    expect(() =>
      registry.resolve({
        providerId: FAKE_PROVIDER_ID,
        modelId: "missing-model",
      }),
    ).toThrow(AgentRuntimeError);
  });
});
