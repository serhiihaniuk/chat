import { describe, expect, it } from "vitest";
import { CONFIG_IDS, SAFETY_POLICIES, TOOL_POLICY_MODES } from "#config/catalog/config-values";
import { PROVIDERS } from "#config/catalog/providers";
import {
  createTurnProfileRegistry,
  type TurnProfileRegistryInput,
  type ServiceTurnProfileConfig,
} from "./turn-profile-registry.js";
import {
  createDefaultTurnProfileConfig,
  DEFAULT_TURN_PROFILE_ID,
} from "./default-turn-profile-config.js";
import { createDefaultSystemPromptBuilder } from "./system-prompt-builder.js";
import { createServiceHostCapabilityManifest } from "../manifest/service-capability-manifest.js";

const baseInput = (
  overrides: Partial<TurnProfileRegistryInput> = {},
): TurnProfileRegistryInput => ({
  turnProfiles: [
    createDefaultTurnProfileConfig({
      providerId: PROVIDERS.FAKE.PROVIDER_ID,
      modelId: PROVIDERS.FAKE.MODELS.FAKE_ECHO.MODEL_ID,
      allowedToolNames: [],
      turnGuardIds: [],
    }),
  ],
  defaultProfileId: DEFAULT_TURN_PROFILE_ID,
  promptBuilder: createDefaultSystemPromptBuilder(),
  providers: [
    {
      providerId: PROVIDERS.FAKE.PROVIDER_ID,
      modelIds: [PROVIDERS.FAKE.MODELS.FAKE_ECHO.MODEL_ID],
    },
  ],
  toolNames: [],
  guardIds: [],
  ...overrides,
});

const customTurnProfile = (
  overrides: Partial<ServiceTurnProfileConfig> = {},
): ServiceTurnProfileConfig => ({
  profileId: "support",
  version: "2026-06-16",
  displayName: "Support profile",
  prompt: { promptId: "support_prompt", sections: [{ id: "role", content: "Help with tickets." }] },
  model: {
    providerId: PROVIDERS.FAKE.PROVIDER_ID,
    modelId: PROVIDERS.FAKE.MODELS.FAKE_ECHO.MODEL_ID,
  },
  toolPolicy: { mode: TOOL_POLICY_MODES.CLOSED, allowedToolNames: [] },
  safety: {
    policyId: SAFETY_POLICIES.STANDARD.ID,
    promptInjectionMode: SAFETY_POLICIES.STANDARD.DEFAULT_PROMPT_INJECTION_MODE,
    turnGuardIds: [],
  },
  ...overrides,
});

describe("createTurnProfileRegistry", () => {
  it("builds one manifest profile from the default turn profile config", () => {
    const registry = createTurnProfileRegistry(baseInput());

    expect(registry.turnProfiles).toHaveLength(1);
    expect(registry.defaultProfileId).toBe(DEFAULT_TURN_PROFILE_ID);
    expect(registry.serviceProfiles[0]?.profile).toMatchObject({
      profileId: "default",
      systemPromptId: CONFIG_IDS.SYSTEM_PROMPTS.DEFAULT_TURN_PROFILE,
      systemInstructions: expect.stringContaining("GitHub-flavored Markdown"),
    });
    expect(registry.serviceProfiles[0]?.prompt).toMatchObject({
      promptId: CONFIG_IDS.SYSTEM_PROMPTS.DEFAULT_TURN_PROFILE,
      sectionIds: [CONFIG_IDS.PROMPT_SECTIONS.OUTPUT_FORMATTING],
    });
    expect(registry.serviceProfiles[0]?.prompt.hash).toMatch(/^sha256:/u);
  });

  it("lets a custom turn profile config override default behavior", () => {
    const registry = createTurnProfileRegistry(
      baseInput({ turnProfiles: [customTurnProfile()], defaultProfileId: "support" }),
    );

    expect(registry.turnProfiles[0]).toMatchObject({
      profileId: "support",
      displayName: "Support profile",
      systemInstructions: "Help with tickets.",
    });
  });

  it("rejects duplicate profile ids", () => {
    expect(() =>
      createTurnProfileRegistry(
        baseInput({
          turnProfiles: [customTurnProfile(), customTurnProfile()],
          defaultProfileId: "support",
        }),
      ),
    ).toThrow("Duplicate turn profile id support.");
  });

  it("rejects a default profile id that is not registered", () => {
    expect(() => createTurnProfileRegistry(baseInput({ defaultProfileId: "absent" }))).toThrow(
      "Default turn profile absent is not registered.",
    );
  });

  it("rejects an unknown provider or model", () => {
    expect(() =>
      createTurnProfileRegistry(
        baseInput({
          turnProfiles: [
            customTurnProfile({ model: { providerId: "openai", modelId: "fake-echo" } }),
          ],
          defaultProfileId: "support",
        }),
      ),
    ).toThrow("references unknown provider openai");

    expect(() =>
      createTurnProfileRegistry(
        baseInput({
          turnProfiles: [customTurnProfile({ model: { providerId: "fake", modelId: "absent" } })],
          defaultProfileId: "support",
        }),
      ),
    ).toThrow("references unknown model absent");
  });

  it("rejects an allowlist that references an unknown tool", () => {
    expect(() =>
      createTurnProfileRegistry(
        baseInput({
          turnProfiles: [
            customTurnProfile({
              toolPolicy: {
                mode: TOOL_POLICY_MODES.PROFILE_ALLOWLIST,
                allowedToolNames: ["ghost"],
              },
            }),
          ],
          defaultProfileId: "support",
          toolNames: ["known_tool"],
        }),
      ),
    ).toThrow("allows unknown tool ghost");
  });

  it("rejects an unknown turn guard reference", () => {
    expect(() =>
      createTurnProfileRegistry(
        baseInput({
          turnProfiles: [
            customTurnProfile({
              safety: {
                policyId: SAFETY_POLICIES.STANDARD.ID,
                promptInjectionMode: SAFETY_POLICIES.STANDARD.DEFAULT_PROMPT_INJECTION_MODE,
                turnGuardIds: ["ghost_guard"],
              },
            }),
          ],
          defaultProfileId: "support",
          guardIds: ["real_guard"],
        }),
      ),
    ).toThrow("references unknown turn guard ghost_guard");
  });

  it("rejects a closed tool policy that lists allowed tool names", () => {
    expect(() =>
      createTurnProfileRegistry(
        baseInput({
          turnProfiles: [
            customTurnProfile({
              toolPolicy: { mode: TOOL_POLICY_MODES.CLOSED, allowedToolNames: ["any"] },
            }),
          ],
          defaultProfileId: "support",
          toolNames: ["any"],
        }),
      ),
    ).toThrow("closed tool policy but lists allowed tool names");
  });

  it("rejects a profile_allowlist tool policy with no tools", () => {
    expect(() =>
      createTurnProfileRegistry(
        baseInput({
          turnProfiles: [
            customTurnProfile({
              toolPolicy: { mode: TOOL_POLICY_MODES.PROFILE_ALLOWLIST, allowedToolNames: [] },
            }),
          ],
          defaultProfileId: "support",
        }),
      ),
    ).toThrow("profile_allowlist tool policy but lists no tools");
  });

  it("supplies the manifest profiles from the registry only", () => {
    const registry = createTurnProfileRegistry(baseInput());
    const manifest = createServiceHostCapabilityManifest({
      turnProfiles: registry.turnProfiles,
      defaultProfileId: registry.defaultProfileId,
    });

    expect(manifest.turnProfiles).toEqual(registry.turnProfiles);
    expect(manifest.defaultTurnProfileId).toBe(registry.defaultProfileId);
  });
});
