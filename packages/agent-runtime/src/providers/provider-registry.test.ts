import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { AgentRuntimeError } from "#runtime/runtime-error";
import {
  createFakeProvider,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
} from "#providers/fake/fake-model-provider";
import { createProviderRegistry } from "./provider-registry.js";

describe("createProviderRegistry", () => {
  it("resolves an explicitly registered provider and model through Effect", async () => {
    const provider = createFakeProvider();
    const registry = createProviderRegistry([provider]);

    await expect(
      Effect.runPromise(
        registry.resolve({
          providerId: FAKE_PROVIDER_ID,
          modelId: FAKE_ECHO_MODEL_ID,
        }),
      ),
    ).resolves.toBe(provider);
  });

  it("rejects unavailable providers without fallback", async () => {
    const registry = createProviderRegistry([createFakeProvider()]);

    await expect(
      Effect.runPromise(registry.resolve({ providerId: "missing", modelId: FAKE_ECHO_MODEL_ID })),
    ).rejects.toThrow(AgentRuntimeError);
  });

  it("rejects unavailable models without fallback", async () => {
    const registry = createProviderRegistry([createFakeProvider()]);

    await expect(
      Effect.runPromise(
        registry.resolve({
          providerId: FAKE_PROVIDER_ID,
          modelId: "missing-model",
        }),
      ),
    ).rejects.toThrow(AgentRuntimeError);
  });
});
