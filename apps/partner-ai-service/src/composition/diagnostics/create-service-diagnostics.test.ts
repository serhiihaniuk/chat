import { describe, expect, it } from "vitest";
import { createMemorySidechatRepositories } from "@side-chat/db";
import { PROVIDERS } from "#config/catalog/providers";
import type { ServicePersistenceBundle } from "../bundle-types.js";
import { createServiceTurnProfileBundle } from "../turn-profile/create-service-turn-profile-bundle.js";
import { createServiceDiagnostics } from "./create-service-diagnostics.js";
import { createServiceProviderBundle } from "../providers/create-service-provider-bundle.js";
import { createServiceToolBundle } from "../tools/create-service-tool-bundle.js";

const workspace = { tenantId: "tenant_diag", workspaceId: "workspace_diag" } as const;

const memoryPersistence: ServicePersistenceBundle = {
  persistence: { kind: "memory" },
  repositories: createMemorySidechatRepositories(),
  persistenceLabel: "memory",
};

describe("createServiceDiagnostics", () => {
  it("re-presents the selected runtime ids and registry status without secrets", () => {
    const providers = createServiceProviderBundle({ workspace });
    const tools = createServiceToolBundle({ workspace });
    const turnProfiles = createServiceTurnProfileBundle(
      { workspace },
      {
        providers: providers.registry,
        tools: tools.registry,
        turnGuardIds: [],
        registeredGuardIds: [],
      },
    );

    const diagnostics = createServiceDiagnostics({
      persistence: memoryPersistence,
      providers,
      tools,
      turnProfiles,
    });

    expect(diagnostics.runtimeProviderId).toBe(PROVIDERS.FAKE.PROVIDER_ID);
    expect(diagnostics.runtimeModelId).toBe(PROVIDERS.FAKE.MODELS.FAKE_ECHO.MODEL_ID);
    expect(diagnostics.persistenceLabel).toBe("memory");
    expect(diagnostics.toolRegistryStatus.tools).toEqual([]);
    expect(diagnostics.turnProfiles).toHaveLength(1);
    expect(JSON.stringify(diagnostics)).not.toContain("apiKey");
  });

  it("reports the openai provider id when an openai runtime is configured", () => {
    const providers = createServiceProviderBundle({
      workspace,
      runtime: {
        provider: PROVIDERS.OPENAI.KIND,
        apiKey: "sk-secret",
        modelIds: ["gpt-test"],
        defaultModelId: "gpt-test",
      },
    });
    const tools = createServiceToolBundle({ workspace });
    const turnProfiles = createServiceTurnProfileBundle(
      { workspace },
      {
        providers: providers.registry,
        tools: tools.registry,
        turnGuardIds: [],
        registeredGuardIds: [],
      },
    );

    const diagnostics = createServiceDiagnostics({
      persistence: memoryPersistence,
      providers,
      tools,
      turnProfiles,
    });

    expect(diagnostics.runtimeModelId).toBe("gpt-test");
    expect(JSON.stringify(diagnostics)).not.toContain("sk-secret");
  });
});
