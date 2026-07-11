import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { CLIENT_TOOL_CATALOG_LIMITS } from "#application/turn/tools/client-tool-catalog";

import { parseChatRequest } from "../chat-request-schema.js";

const USER_MESSAGE: UIMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
};

const VALID_TOOL = {
  name: "open_file",
  description: "Open one file.",
  inputSchema: { type: "object" },
} as const;

describe("chat request client-tool catalog", () => {
  it("admits a bounded catalog with conservative tool identifiers", async () => {
    const request = await parseChatRequest(chatEnvelope([VALID_TOOL]));

    expect(request?.clientTools).toEqual([VALID_TOOL]);
  });

  it.each([
    [{ ...VALID_TOOL, name: "1_invalid" }, "invalid leading character"],
    [
      {
        ...VALID_TOOL,
        name: `a${"b".repeat(CLIENT_TOOL_CATALOG_LIMITS.MAX_NAME_LENGTH)}`,
      },
      "long name",
    ],
    [
      {
        ...VALID_TOOL,
        description: "x".repeat(
          CLIENT_TOOL_CATALOG_LIMITS.MAX_DESCRIPTION_LENGTH + 1,
        ),
      },
      "long description",
    ],
  ] as const)(
    "rejects catalog metadata outside its bounds: %s",
    async (tool, _reason) => {
      await expect(
        parseChatRequest(chatEnvelope([tool])),
      ).resolves.toBeUndefined();
    },
  );

  it("rejects a catalog above the per-request tool limit", async () => {
    const tools = Array.from(
      { length: CLIENT_TOOL_CATALOG_LIMITS.MAX_TOOLS + 1 },
      (_, index) => ({
        ...VALID_TOOL,
        name: `tool_${index}`,
      }),
    );

    await expect(
      parseChatRequest(chatEnvelope(tools)),
    ).resolves.toBeUndefined();
  });
});

function chatEnvelope(
  clientTools: readonly unknown[],
): Record<string, unknown> {
  return {
    requestId: "request-1",
    conversationId: "conversation-1",
    messages: [USER_MESSAGE],
    clientTools,
  };
}
