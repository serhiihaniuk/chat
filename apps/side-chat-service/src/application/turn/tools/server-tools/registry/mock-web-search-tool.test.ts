import { describe, expect, it } from "vitest";

import { SERVER_TOOL_APPROVAL_POLICIES } from "../server-tool-catalog.js";
import { MOCK_WEB_SEARCH_TOOL, MOCK_WEB_SEARCH_TOOL_NAME } from "./mock-web-search-tool.js";

describe("mock web search server tool", () => {
  it("is registered with mandatory user approval and a bounded query schema", () => {
    expect(MOCK_WEB_SEARCH_TOOL.name).toBe(MOCK_WEB_SEARCH_TOOL_NAME);
    expect(MOCK_WEB_SEARCH_TOOL.approvalPolicy).toEqual({
      kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS,
    });
    expect(MOCK_WEB_SEARCH_TOOL.validateInput({ query: "current releases" })).toBe(true);
    expect(MOCK_WEB_SEARCH_TOOL.validateInput({ query: "   " })).toBe(false);
    expect(MOCK_WEB_SEARCH_TOOL.validateInput({ query: 42 })).toBe(false);
  });

  it("returns deterministic search-shaped data without an external request", async () => {
    await expect(
      MOCK_WEB_SEARCH_TOOL.execute(
        { query: "  durable workflows  " },
        { executionKey: "turn-1:call-1:digest" },
      ),
    ).resolves.toEqual({
      query: "durable workflows",
      summary: 'Mocked web search found briefing-style context for "durable workflows".',
      results: [
        {
          title: "Mock Search Result",
          url: "https://example.test/search-result",
          snippet: "This deterministic result behaves like web search without leaving the backend.",
        },
      ],
    });
  });
});
