import { describe, expect, it } from "vitest";
import {
  createServiceProviderRegistry,
  ServiceProviderRegistryError,
  type ServiceProviderRegistration,
} from "./service-provider-registry.js";

const fakeRegistration = (
  overrides: Partial<Extract<ServiceProviderRegistration, { kind: "fake" }>> = {},
): ServiceProviderRegistration => ({
  kind: "fake",
  providerId: "fake",
  modelIds: ["fake-echo"],
  defaultModelId: "fake-echo",
  ...overrides,
});

describe("createServiceProviderRegistry", () => {
  it("requires at least one provider registration", () => {
    expect(() => createServiceProviderRegistry([])).toThrow(ServiceProviderRegistryError);
  });

  it("rejects duplicate provider ids", () => {
    expect(() =>
      createServiceProviderRegistry([
        fakeRegistration(),
        fakeRegistration({ modelIds: ["other"], defaultModelId: "other" }),
      ]),
    ).toThrow("Duplicate provider id fake.");
  });

  it("rejects duplicate model ids within one provider", () => {
    expect(() =>
      createServiceProviderRegistry([fakeRegistration({ modelIds: ["fake-echo", "fake-echo"] })]),
    ).toThrow("Duplicate model id fake-echo in provider fake.");
  });

  it("rejects a default model that is not in the provider model ids", () => {
    expect(() =>
      createServiceProviderRegistry([
        fakeRegistration({ modelIds: ["fake-echo"], defaultModelId: "absent" }),
      ]),
    ).toThrow("Default model absent is not registered for provider fake.");
  });

  it("publishes the first registration as the default and omits openai secrets", () => {
    const registry = createServiceProviderRegistry([
      {
        kind: "openai",
        providerId: "openai",
        modelIds: ["gpt-5.4-mini", "gpt-5.4"],
        defaultModelId: "gpt-5.4-mini",
        apiKey: "sk-secret-key",
        baseUrl: "https://secret-provider.example/v1",
        retention: "provider_default",
        reasoning: { effort: "medium", summary: "auto", allowedEfforts: ["low", "medium", "high"] },
      },
    ]);

    expect(registry.providers).toHaveLength(1);
    expect(registry.defaultProviderId).toBe("openai");
    expect(registry.defaultModelId).toBe("gpt-5.4-mini");
    expect(registry.status.providers[0]).toEqual({
      providerId: "openai",
      modelIds: ["gpt-5.4-mini", "gpt-5.4"],
      defaultModelId: "gpt-5.4-mini",
      retention: "provider_default",
      models: [
        { modelId: "gpt-5.4-mini", displayName: "gpt-5.4-mini" },
        { modelId: "gpt-5.4", displayName: "gpt-5.4" },
      ],
      reasoning: { effort: "medium", summary: "auto", allowedEfforts: ["low", "medium", "high"] },
    });

    const statusText = JSON.stringify(registry.status);
    expect(statusText).not.toContain("sk-secret-key");
    expect(statusText).not.toContain("secret-provider.example");
  });
});
