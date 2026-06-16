import { FAKE_ECHO_MODEL_ID, FAKE_PROVIDER_ID } from "@side-chat/agent-runtime";
import { describe, expect, it } from "vitest";
import type { ServicePersistenceBundle } from "./bundle-types.js";
import { createServiceAssistantBundle } from "./create-service-assistant-bundle.js";
import { createServiceDiagnostics } from "./create-service-diagnostics.js";
import { createServiceProviderBundle } from "./create-service-provider-bundle.js";
import { createServiceToolBundle } from "./create-service-tool-bundle.js";

const workspace = { tenantId: "tenant_diag", workspaceId: "workspace_diag" } as const;

const memoryPersistence: ServicePersistenceBundle = {
  persistence: { kind: "memory" },
  repositories: {} as ServicePersistenceBundle["repositories"],
  persistenceLabel: "memory",
};

describe("createServiceDiagnostics", () => {
  it("re-presents the selected runtime ids and registry status without secrets", () => {
    const providers = createServiceProviderBundle({ workspace });
    const tools = createServiceToolBundle({ workspace });
    const assistants = createServiceAssistantBundle(
      { workspace },
      { providers: providers.registry, tools: tools.registry, turnGuardIds: [], registeredGuardIds: [] },
    );

    const diagnostics = createServiceDiagnostics({
      persistence: memoryPersistence,
      providers,
      tools,
      assistants,
    });

    expect(diagnostics.runtimeProviderId).toBe(FAKE_PROVIDER_ID);
    expect(diagnostics.runtimeModelId).toBe(FAKE_ECHO_MODEL_ID);
    expect(diagnostics.persistenceLabel).toBe("memory");
    expect(diagnostics.toolRegistryStatus.tools).toEqual([]);
    expect(diagnostics.assistantProfiles).toHaveLength(1);
    expect(JSON.stringify(diagnostics)).not.toContain("apiKey");
  });

  it("reports the openai provider id when an openai runtime is configured", () => {
    const providers = createServiceProviderBundle({
      workspace,
      runtime: {
        provider: "openai",
        apiKey: "sk-secret",
        modelIds: ["gpt-test"],
        defaultModelId: "gpt-test",
      },
    });
    const tools = createServiceToolBundle({ workspace });
    const assistants = createServiceAssistantBundle(
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
      assistants,
    });

    expect(diagnostics.runtimeModelId).toBe("gpt-test");
    expect(JSON.stringify(diagnostics)).not.toContain("sk-secret");
  });
});
