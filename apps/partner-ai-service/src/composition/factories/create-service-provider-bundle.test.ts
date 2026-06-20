import { describe, expect, it } from "vitest";
import { ServiceProviderRegistryError } from "#composition/providers/service-provider-registry";
import { PROVIDERS } from "#config/catalog/providers";
import { createServiceProviderBundle } from "./create-service-provider-bundle.js";

const workspace = { tenantId: "tenant_prov", workspaceId: "workspace_prov" } as const;

describe("createServiceProviderBundle", () => {
  it("defaults to the fake provider when no runtime config is given", () => {
    const bundle = createServiceProviderBundle({ workspace });

    expect(bundle.defaultProviderId).toBe(PROVIDERS.FAKE.PROVIDER_ID);
    expect(bundle.defaultModelId).toBe(PROVIDERS.FAKE.MODELS.FAKE_ECHO.MODEL_ID);
    expect(bundle.runtimeProviders).toHaveLength(1);
  });

  it("builds the OpenAI provider from runtime config", () => {
    const bundle = createServiceProviderBundle({
      workspace,
      runtime: {
        provider: PROVIDERS.OPENAI.KIND,
        apiKey: "sk-test",
        modelIds: ["gpt-test"],
        defaultModelId: "gpt-test",
      },
    });

    expect(bundle.defaultProviderId).toBe(PROVIDERS.OPENAI.PROVIDER_ID);
    expect(bundle.defaultModelId).toBe("gpt-test");
  });

  it("rejects an OpenAI default model that is not registered", () => {
    expect(() =>
      createServiceProviderBundle({
        workspace,
        runtime: {
          provider: PROVIDERS.OPENAI.KIND,
          apiKey: "sk-test",
          modelIds: ["gpt-test"],
          defaultModelId: "gpt-missing",
        },
      }),
    ).toThrow(ServiceProviderRegistryError);
  });
});
