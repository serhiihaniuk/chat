import { RUNTIME_ERROR_CODES, type RuntimeToolContext } from "@side-chat/agent-runtime";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createMockWebSearchTool } from "./mock-web-search-tool.js";

describe("createMockWebSearchTool", () => {
  it("fails with an explicit repair message when the query is missing", async () => {
    const tool = createMockWebSearchTool({ delayMs: 0 });

    await expect(Effect.runPromise(tool.execute({}, toolContext))).rejects.toMatchObject({
      code: RUNTIME_ERROR_CODES.TOOL_FAILED,
      message: "mock_web_search requires a non-empty query string.",
    });
  });

  it("trims and returns the deterministic mock search result", async () => {
    const tool = createMockWebSearchTool({ delayMs: 0 });

    await expect(
      Effect.runPromise(tool.execute({ query: "  current releases  " }, toolContext)),
    ).resolves.toMatchObject({
      query: "current releases",
      results: [
        {
          title: "Mock Search Result",
          url: "https://example.test/search-result",
        },
      ],
    });
  });
});

const toolContext: RuntimeToolContext = {
  requestId: "request_001",
  assistantTurnId: "assistant_turn_001",
  modelId: "fake-echo",
  toolName: "mock_web_search",
};
