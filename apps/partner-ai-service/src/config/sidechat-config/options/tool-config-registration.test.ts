import { describe, expect, it } from "vitest";

import sideChatFakeConfig from "#sidechat-fake-config";
import { createPartnerAiServiceApp } from "#inbound/http/app";
import { TOOLS } from "#config/catalog/capabilities/tools";
import { TOOL_POLICY_MODES } from "#config/catalog/config-values";
import {
  createPartnerAiServiceOptionsFromConfig,
  defineSideChatConfig,
} from "#config/sidechat-config";
import { SERVICE_ENV_KEYS } from "#config/env/service-env-contract";

const FAKE_ENV = {
  [SERVICE_ENV_KEYS.authBearerToken]: "local-fake-token",
  [SERVICE_ENV_KEYS.safetyPollIntervalMs]: "10",
} as const;

describe("config-driven tool registration", () => {
  it("registers a config tool through the map and offers it to the model", async () => {
    // The tool comes only from the config `tools` block through the registration
    // map (no programmatic `runtime.tools`); the manifest offering it — plus the
    // profile allowlisting it — is what makes it model-callable.
    const options = createPartnerAiServiceOptionsFromConfig(sideChatFakeConfig, FAKE_ENV);
    expect(options.runtime).toMatchObject({
      tools: [{ name: TOOLS.MOCK_WEB_SEARCH.NAME, defaultEnabled: true }],
    });
    expect(options.turnProfiles?.[0]?.toolPolicy).toMatchObject({
      allowedToolNames: [TOOLS.MOCK_WEB_SEARCH.NAME],
    });

    const app = createPartnerAiServiceApp(options);
    const health = await app.request("/healthz");
    await expect(health.json()).resolves.toMatchObject({
      tools: { tools: [{ name: TOOLS.MOCK_WEB_SEARCH.NAME, defaultEnabled: true }] },
    });
  });

  it("fails boot with the available tool names when a configured tool is unknown", () => {
    const unknownName = "custom.unknown_tool";
    const [baseTool] = sideChatFakeConfig.tools.availableTools;
    if (!baseTool) throw new Error("Expected the fake config to configure a tool.");
    const config = defineSideChatConfig({
      ...sideChatFakeConfig,
      tools: {
        availableTools: [
          {
            ...baseTool,
            tool: { ...TOOLS.MOCK_WEB_SEARCH, NAME: unknownName, LABEL: "Custom unknown" },
          },
        ],
      },
      chat: {
        ...sideChatFakeConfig.chat,
        turnProfile: {
          ...sideChatFakeConfig.chat.turnProfile,
          tools: { mode: TOOL_POLICY_MODES.PROFILE_ALLOWLIST, names: [unknownName] },
        },
      },
    });

    expect(() => createPartnerAiServiceOptionsFromConfig(config, FAKE_ENV)).toThrow(
      /Unsupported configured tool custom\.unknown_tool\. Available tools: mock_web_search/u,
    );
  });
});
