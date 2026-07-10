import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";

import { createDevelopmentPartnerAiServiceApp } from "../../app.js";

describe("partner ai service tool catalog", () => {
  it("exposes the configured tool catalog with curated labels and default-enabled flags", async () => {
    const response = await createDevelopmentPartnerAiServiceApp({
      runtime: { provider: "fake", enableMockWebSearch: true },
    }).request("/tools", { headers: { authorization: "Bearer local-test-token" } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      tools: [
        {
          name: "mock_web_search",
          label: "Mock web search",
          description: expect.stringContaining("Search the web"),
          defaultEnabled: true,
        },
      ],
    });
  });

  it("serves an empty catalog when no backend tools are configured", async () => {
    const response = await createDevelopmentPartnerAiServiceApp().request("/tools", {
      headers: { authorization: "Bearer local-test-token" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      tools: [],
    });
  });

  it("requires authentication", async () => {
    const response = await createDevelopmentPartnerAiServiceApp().request("/tools");
    expect(response.status).toBe(401);
  });
});
