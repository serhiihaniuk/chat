import { RUNTIME_ERROR_CODES } from "@side-chat/ai-runtime-contract";
import type { RuntimeToolContext } from "@side-chat/agent-runtime";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createMockWebSearchTool, parseMockSearchResults } from "./mock-web-search-tool.js";

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

describe("parseMockSearchResults", () => {
  it("parses a bare JSON array of results", () => {
    const results = parseMockSearchResults(
      '[{"title":"A","url":"https://a.test","snippet":"first"},{"title":"B","url":"https://b.test","snippet":"second"}]',
      5,
    );
    expect(results).toEqual([
      { title: "A", url: "https://a.test", snippet: "first" },
      { title: "B", url: "https://b.test", snippet: "second" },
    ]);
  });

  it("extracts the array when the model wraps it in prose or a code fence", () => {
    const results = parseMockSearchResults(
      'Here are the results:\n```json\n[{"title":"A","url":"https://a.test"}]\n```\nHope that helps!',
      5,
    );
    expect(results).toEqual([{ title: "A", url: "https://a.test", snippet: "" }]);
  });

  it("drops entries missing a title or url and caps at the requested count", () => {
    const results = parseMockSearchResults(
      '[{"title":"A","url":"https://a.test"},{"snippet":"no url"},{"title":"C","url":"https://c.test"}]',
      1,
    );
    expect(results).toEqual([{ title: "A", url: "https://a.test", snippet: "" }]);
  });

  it("returns [] for non-JSON or non-array output (so the caller falls back)", () => {
    expect(parseMockSearchResults("I could not find anything.", 5)).toEqual([]);
    expect(parseMockSearchResults('{"title":"not an array"}', 5)).toEqual([]);
  });
});

const toolContext: RuntimeToolContext = {
  requestId: "request_001",
  assistantTurnId: "assistant_turn_001",
  modelId: "fake-echo",
  toolName: "mock_web_search",
};
