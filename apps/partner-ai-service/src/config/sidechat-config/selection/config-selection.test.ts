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

  it("loads the root config module", async () => {
    const result = await loadSelectedSideChatConfig({});

    expect(result).toMatchObject({
      loaded: true,
      selection: { name: "default" },
    });
  });
});
