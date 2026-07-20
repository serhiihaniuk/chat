import { describe, expect, it, vi } from "vitest";
import {
  SERVER_TOOL_APPROVAL_POLICIES,
  type ServerToolExecutionContext,
  type ServerToolTextGenerator,
} from "@side-chat/side-chat-server";

import {
  DEFAULT_MOCK_WEB_SEARCH_MODEL_ID,
  DEFAULT_MOCK_WEB_SEARCH_RESULT_COUNT,
  MOCK_WEB_SEARCH_TOOL,
  MOCK_WEB_SEARCH_TOOL_NAME,
  parseMockSearchResults,
} from "./tool.js";

const BASE_CONTEXT = {
  actor: { workspaceId: "workspace-1", subjectId: "subject-1" },
  invocation: {
    conversationId: "conversation-1",
    turnId: "turn-1",
    runId: "run-1",
    toolCallId: "call-1",
  },
  executionKey: "turn-1:call-1:digest",
} as const satisfies ServerToolExecutionContext;

describe("mock web search integration tool", () => {
  it("is gated and validates a bounded query", () => {
    expect(MOCK_WEB_SEARCH_TOOL.name).toBe(MOCK_WEB_SEARCH_TOOL_NAME);
    expect(MOCK_WEB_SEARCH_TOOL.approvalPolicy).toEqual({
      kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS,
    });
    expect(MOCK_WEB_SEARCH_TOOL.validateInput({ query: "current releases" })).toBe(true);
    expect(MOCK_WEB_SEARCH_TOOL.validateInput({ query: "   " })).toBe(false);
    expect(MOCK_WEB_SEARCH_TOOL.validateInput({ query: 42 })).toBe(false);
  });

  it("runs nested generation after approval", async () => {
    const generateText = vi.fn<ServerToolTextGenerator>(() =>
      Promise.resolve(
        '[{"title":"Workflow guide","url":"https://example.com/workflows","snippet":"A current guide."}]',
      ),
    );

    await expect(
      MOCK_WEB_SEARCH_TOOL.execute(
        { query: "  durable workflows  " },
        { ...BASE_CONTEXT, generateText },
      ),
    ).resolves.toMatchObject({
      query: "durable workflows",
      summary: 'Mocked web search found 1 result for "durable workflows".',
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

  it("uses a deterministic fallback when nested generation is unavailable", async () => {
    await expect(
      MOCK_WEB_SEARCH_TOOL.execute({ query: "durable workflows" }, BASE_CONTEXT),
    ).resolves.toMatchObject({
      query: "durable workflows",
      results: [{ title: "Mock Search Result", url: "https://example.test/search-result" }],
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
    ).toEqual([{ label: "Workflow guide", url: "https://example.com/workflows" }]);
  });
});

describe("parseMockSearchResults", () => {
  it("extracts valid entries and fails safely", () => {
    expect(
      parseMockSearchResults('Results:\n```json\n[{"title":"A","url":"https://a.test"}]\n```', 5),
    ).toEqual([{ title: "A", url: "https://a.test", snippet: "" }]);
    expect(parseMockSearchResults("not JSON", 5)).toEqual([]);
  });
});
