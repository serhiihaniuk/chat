import { describe, expect, it } from "vitest";
import {
  createAssistantProfileRegistry,
  type AssistantProfileRegistryInput,
  type ServiceAssistantConfig,
} from "./assistant-profile-registry.js";
import {
  createDefaultAssistantConfig,
  DEFAULT_ASSISTANT_PROFILE_ID,
} from "./default-assistant-config.js";
import { createDefaultSystemPromptBuilder } from "./system-prompt-builder.js";
import { createServiceHostCapabilityManifest } from "../manifest/service-capability-manifest.js";

const baseInput = (
  overrides: Partial<AssistantProfileRegistryInput> = {},
): AssistantProfileRegistryInput => ({
  assistants: [
    createDefaultAssistantConfig({
      providerId: "fake",
      modelId: "fake-echo",
      allowedToolNames: [],
      turnGuardIds: [],
    }),
  ],
  defaultProfileId: DEFAULT_ASSISTANT_PROFILE_ID,
  promptBuilder: createDefaultSystemPromptBuilder(),
  providers: [{ providerId: "fake", modelIds: ["fake-echo"] }],
  toolNames: [],
  guardIds: [],
  ...overrides,
});

const customAssistant = (overrides: Partial<ServiceAssistantConfig> = {}): ServiceAssistantConfig => ({
  profileId: "support",
  version: "2026-06-16",
  displayName: "Support assistant",
  prompt: { promptId: "support_prompt", sections: [{ id: "role", content: "Help with tickets." }] },
  model: { providerId: "fake", modelId: "fake-echo" },
  toolPolicy: { mode: "closed", allowedToolNames: [] },
  safety: { policyId: "standard", promptInjectionMode: "standard", turnGuardIds: [] },
  ...overrides,
});

describe("createAssistantProfileRegistry", () => {
  it("builds one manifest profile from the default assistant config", () => {
    const registry = createAssistantProfileRegistry(baseInput());

    expect(registry.assistantProfiles).toHaveLength(1);
    expect(registry.defaultProfileId).toBe(DEFAULT_ASSISTANT_PROFILE_ID);
    expect(registry.serviceProfiles[0]?.profile).toMatchObject({
      profileId: "default",
      systemPromptId: "runtime_default_profile",
      systemInstructions: expect.stringContaining("GitHub-flavored Markdown"),
    });
    expect(registry.serviceProfiles[0]?.prompt).toMatchObject({
      promptId: "runtime_default_profile",
      sectionIds: ["output_formatting"],
    });
    expect(registry.serviceProfiles[0]?.prompt.hash).toMatch(/^sha256:/u);
  });

  it("lets a custom assistant config override default behavior", () => {
    const registry = createAssistantProfileRegistry(
      baseInput({ assistants: [customAssistant()], defaultProfileId: "support" }),
    );

    expect(registry.assistantProfiles[0]).toMatchObject({
      profileId: "support",
      displayName: "Support assistant",
      systemInstructions: "Help with tickets.",
    });
  });

  it("rejects duplicate profile ids", () => {
    expect(() =>
      createAssistantProfileRegistry(
        baseInput({ assistants: [customAssistant(), customAssistant()], defaultProfileId: "support" }),
      ),
    ).toThrow("Duplicate assistant profile id support.");
  });

  it("rejects a default profile id that is not registered", () => {
    expect(() =>
      createAssistantProfileRegistry(baseInput({ defaultProfileId: "absent" })),
    ).toThrow("Default assistant profile absent is not registered.");
  });

  it("rejects an unknown provider or model", () => {
    expect(() =>
      createAssistantProfileRegistry(
        baseInput({
          assistants: [customAssistant({ model: { providerId: "openai", modelId: "fake-echo" } })],
          defaultProfileId: "support",
        }),
      ),
    ).toThrow("references unknown provider openai");

    expect(() =>
      createAssistantProfileRegistry(
        baseInput({
          assistants: [customAssistant({ model: { providerId: "fake", modelId: "absent" } })],
          defaultProfileId: "support",
        }),
      ),
    ).toThrow("references unknown model absent");
  });

  it("rejects an allowlist that references an unknown tool", () => {
    expect(() =>
      createAssistantProfileRegistry(
        baseInput({
          assistants: [
            customAssistant({ toolPolicy: { mode: "profile_allowlist", allowedToolNames: ["ghost"] } }),
          ],
          defaultProfileId: "support",
          toolNames: ["known_tool"],
        }),
      ),
    ).toThrow("allows unknown tool ghost");
  });

  it("rejects an unknown turn guard reference", () => {
    expect(() =>
      createAssistantProfileRegistry(
        baseInput({
          assistants: [
            customAssistant({
              safety: { policyId: "standard", promptInjectionMode: "standard", turnGuardIds: ["ghost_guard"] },
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
      createAssistantProfileRegistry(
        baseInput({
          assistants: [customAssistant({ toolPolicy: { mode: "closed", allowedToolNames: ["any"] } })],
          defaultProfileId: "support",
          toolNames: ["any"],
        }),
      ),
    ).toThrow("closed tool policy but lists allowed tool names");
  });

  it("rejects a profile_allowlist tool policy with no tools", () => {
    expect(() =>
      createAssistantProfileRegistry(
        baseInput({
          assistants: [customAssistant({ toolPolicy: { mode: "profile_allowlist", allowedToolNames: [] } })],
          defaultProfileId: "support",
        }),
      ),
    ).toThrow("profile_allowlist tool policy but lists no tools");
  });

  it("supplies the manifest profiles from the registry only", () => {
    const registry = createAssistantProfileRegistry(baseInput());
    const manifest = createServiceHostCapabilityManifest({
      assistantProfiles: registry.assistantProfiles,
      defaultProfileId: registry.defaultProfileId,
    });

    expect(manifest.assistantProfiles).toEqual(registry.assistantProfiles);
    expect(manifest.defaultAssistantProfileId).toBe(registry.defaultProfileId);
  });
});
