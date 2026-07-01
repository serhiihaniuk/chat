import { describe, expect, it } from "vitest";
import { TurnProfileRegistryError } from "#composition/turn-profile/turn-profile-registry";
import { DEFAULT_TURN_PROFILE_ID } from "#composition/turn-profile/default-turn-profile-config";
import { createServiceTurnProfileBundle } from "./create-service-turn-profile-bundle.js";
import { createServiceProviderBundle } from "../providers/create-service-provider-bundle.js";
import { createServiceToolBundle } from "../tools/create-service-tool-bundle.js";

const workspace = { tenantId: "tenant_a", workspaceId: "workspace_a" } as const;

const registries = () => {
  const providers = createServiceProviderBundle({ workspace });
  const tools = createServiceToolBundle({ workspace });
  return { providers: providers.registry, tools: tools.registry };
};

describe("createServiceTurnProfileBundle", () => {
  it("builds the default turn profile from the provider and tool registries", () => {
    const { providers, tools } = registries();

    const bundle = createServiceTurnProfileBundle(
      { workspace },
      { providers, tools, turnGuardIds: [], registeredGuardIds: [] },
    );

    expect(bundle.defaultTurnProfileId).toBe(DEFAULT_TURN_PROFILE_ID);
    expect(bundle.registry.turnProfiles).toHaveLength(1);
    expect(bundle.registry.turnProfiles[0]?.systemInstructions).toContain(
      "GitHub-flavored Markdown",
    );
  });

  it("rejects a default turn profile that selects an unregistered turn guard", () => {
    const { providers, tools } = registries();

    expect(() =>
      createServiceTurnProfileBundle(
        { workspace },
        { providers, tools, turnGuardIds: ["guard_missing"], registeredGuardIds: [] },
      ),
    ).toThrow(TurnProfileRegistryError);
  });
});
