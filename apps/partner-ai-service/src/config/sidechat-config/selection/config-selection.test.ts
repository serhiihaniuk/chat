import { describe, expect, it } from "vitest";
import sideChatConfig from "#sidechat-config";
import { PROVIDERS } from "#config/catalog/providers";
import {
  SIDECHAT_CONFIG_ENV_KEY,
  loadSelectedSideChatConfig,
  selectSideChatConfig,
} from "#config/sidechat-config/selection/config-selection";

describe("sidechat config selection", () => {
  it("selects the default root config when no registry is exported", () => {
    const selection = selectSideChatConfig({ default: sideChatConfig }, {});

    expect(selection.name).toBe("default");
    expect(selection.config.models.default.model.MODEL_ID).toBe(
      PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.MODEL_ID,
    );
  });

  it("rejects named config selection when the module only exports one config", () => {
    expect(() =>
      selectSideChatConfig({ default: sideChatConfig }, { [SIDECHAT_CONFIG_ENV_KEY]: "local" }),
    ).toThrow("SIDECHAT_CONFIG must be one of default");
  });

  it("rejects dynamically loaded values that bypass defineSideChatConfig", () => {
    expect(() => selectSideChatConfig({ default: {} }, {})).toThrow(
      "default sidechat config must be created with defineSideChatConfig()",
    );

    expect(() =>
      selectSideChatConfig(
        { SIDECHAT_CONFIGS: { local: {} } },
        { [SIDECHAT_CONFIG_ENV_KEY]: "local" },
      ),
    ).toThrow("SIDECHAT_CONFIGS.local must be created with defineSideChatConfig()");
  });

  it("loads the root config module", async () => {
    const selection = await loadSelectedSideChatConfig({});

    expect(selection).toMatchObject({ name: "default" });
  });

  it("fails loudly when the config module cannot load, naming module and reason", async () => {
    // There is no fallback config system: a broken config is a fatal boot error
    // (ADR 0010), never a silent boot with different behavior.
    await expect(
      loadSelectedSideChatConfig({ SIDECHAT_CONFIG_PATH: "./no-such-sidechat.config.ts" }),
    ).rejects.toThrow(/Unable to load the SideChat config module at .*no-such-sidechat\.config/u);
  });

  it("fails loudly when the config module throws at load time", async () => {
    await expect(
      loadSelectedSideChatConfig({
        SIDECHAT_CONFIG_PATH:
          "apps/partner-ai-service/src/config/sidechat-config/selection/broken-config.fixture.ts",
      }),
    ).rejects.toThrow(/Unable to load the SideChat config module .*broken on purpose/u);
  });
});
