import { describe, expect, it } from "vitest";
import { AssistantProfileRegistryError } from "#composition/assistant/assistant-profile-registry";
import { DEFAULT_ASSISTANT_PROFILE_ID } from "#composition/assistant/default-assistant-config";
import { createServiceAssistantBundle } from "./create-service-assistant-bundle.js";
import { createServiceProviderBundle } from "./create-service-provider-bundle.js";
import { createServiceToolBundle } from "./create-service-tool-bundle.js";

const workspace = { tenantId: "tenant_a", workspaceId: "workspace_a" } as const;

const registries = () => {
  const providers = createServiceProviderBundle({ workspace });
  const tools = createServiceToolBundle({ workspace });
  return { providers: providers.registry, tools: tools.registry };
};

describe("createServiceAssistantBundle", () => {
  it("builds the default assistant from the provider and tool registries", () => {
    const { providers, tools } = registries();

    const bundle = createServiceAssistantBundle(
      { workspace },
      { providers, tools, turnGuardIds: [], registeredGuardIds: [] },
    );

    expect(bundle.defaultAssistantProfileId).toBe(DEFAULT_ASSISTANT_PROFILE_ID);
    expect(bundle.registry.assistantProfiles).toHaveLength(1);
    expect(bundle.registry.assistantProfiles[0]?.systemInstructions).toContain(
      "GitHub-flavored Markdown",
    );
  });

  it("rejects a default assistant that selects an unregistered turn guard", () => {
    const { providers, tools } = registries();

    expect(() =>
      createServiceAssistantBundle(
        { workspace },
        { providers, tools, turnGuardIds: ["guard_missing"], registeredGuardIds: [] },
      ),
    ).toThrow(AssistantProfileRegistryError);
  });
});
