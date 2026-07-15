import { describe, expect, it, vi } from "vitest";

import {
  SERVER_TOOL_APPROVAL_POLICIES,
  type ServerToolTextGenerator,
} from "../server-tool-catalog.js";
import {
  DEFAULT_MOCK_WEB_SEARCH_MODEL_ID,
  DEFAULT_MOCK_WEB_SEARCH_RESULT_COUNT,
  MOCK_WEB_SEARCH_TOOL,
  MOCK_WEB_SEARCH_TOOL_NAME,
  parseMockSearchResults,
} from "./mock-web-search-tool.js";

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

  it("uses gpt-5.4-mini after approval and parses its search-shaped result", async () => {
    const generateText = vi.fn<ServerToolTextGenerator>(() =>
      Promise.resolve(
        '[{"title":"Workflow guide","url":"https://example.com/workflows","snippet":"A current guide."}]',
      ),
    );

    await expect(
      MOCK_WEB_SEARCH_TOOL.execute(
        { query: "  durable workflows  " },
        { executionKey: "turn-1:call-1:digest", generateText },
      ),
    ).resolves.toEqual({
      query: "durable workflows",
      summary: 'Mocked web search found 1 result for "durable workflows".',
      results: [
        {
          title: "Workflow guide",
          url: "https://example.com/workflows",
          snippet: "A current guide.",
        },
      ],
    });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: DEFAULT_MOCK_WEB_SEARCH_MODEL_ID,
        prompt: expect.stringContaining(
          `Return exactly ${DEFAULT_MOCK_WEB_SEARCH_RESULT_COUNT} results`,
        ),
      }),
    );
  });

  it("uses the deterministic local fallback only when nested generation is unavailable", async () => {
    await expect(
      MOCK_WEB_SEARCH_TOOL.execute(
        { query: "durable workflows" },
        { executionKey: "turn-1:call-1:digest" },
      ),
    ).resolves.toMatchObject({
      query: "durable workflows",
      results: [
        {
          title: "Mock Search Result",
          url: "https://example.test/search-result",
        },
      ],
    });
  });

  it("projects trusted result URLs into native message sources", () => {
    expect(
      MOCK_WEB_SEARCH_TOOL.readSources?.({
        query: "durable workflows",
        summary: "One result",
        results: [
          {
            title: "Workflow guide",
            url: "https://example.com/workflows",
            snippet: "A current guide.",
          },
        ],
      }),
    ).toEqual([
      {
        label: "Workflow guide",
        url: "https://example.com/workflows",
      },
    ]);
  });
});

describe("parseMockSearchResults", () => {
  it("extracts a JSON array from prose or a code fence", () => {
    expect(
      parseMockSearchResults('Results:\n```json\n[{"title":"A","url":"https://a.test"}]\n```', 5),
    ).toEqual([{ title: "A", url: "https://a.test", snippet: "" }]);
  });

  it("drops invalid entries, caps the count, and rejects unparseable output", () => {
    expect(
      parseMockSearchResults(
        '[{"title":"A","url":"https://a.test"},{"snippet":"missing identity"},{"title":"B","url":"https://b.test"}]',
        1,
      ),
    ).toEqual([{ title: "A", url: "https://a.test", snippet: "" }]);
    expect(parseMockSearchResults("not JSON", 5)).toEqual([]);
    expect(parseMockSearchResults('{"title":"not an array"}', 5)).toEqual([]);
  });
});
