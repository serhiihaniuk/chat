import { describe, expect, it } from "vitest";

import { BUNDLED_CONFIG_NAMES, loadSideChatConfig } from "./bundled-config-catalog.js";
import { SERVICE_ENV_KEYS } from "./side-chat-config.js";

describe("bundled config catalog", () => {
  it("keeps simulated tools out of the production default", () => {
    const config = loadSideChatConfig({
      [SERVICE_ENV_KEYS.CONFIG_NAME]: BUNDLED_CONFIG_NAMES.DEFAULT,
    });

    expect(config.serverTools).toEqual([]);
  });
});
