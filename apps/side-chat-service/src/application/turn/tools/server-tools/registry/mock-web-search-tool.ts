import { isRecord, type JsonValue } from "@side-chat/shared";

import { SERVER_TOOL_APPROVAL_POLICIES, defineServerTool } from "../server-tool-catalog.js";

export const MOCK_WEB_SEARCH_TOOL_NAME = "mock_web_search";
export const MOCK_WEB_SEARCH_TOOL_DESCRIPTION =
  "Search deterministic fixture data for recent or external information.";

type MockWebSearchInput = Readonly<{ query: string }>;

const MOCK_WEB_SEARCH_INPUT_SCHEMA = {
  type: "object",
  properties: {
    query: {
      type: "string",
      minLength: 1,
      description: "The web search query to run.",
    },
  },
  required: ["query"],
  additionalProperties: false,
} as const;

/**
 * Development-safe search fixture. It exercises the complete registered-tool
 * and durable-approval path without making an external network request.
 */
export const MOCK_WEB_SEARCH_TOOL = defineServerTool<JsonValue, unknown>({
  name: MOCK_WEB_SEARCH_TOOL_NAME,
  description: MOCK_WEB_SEARCH_TOOL_DESCRIPTION,
  inputSchema: MOCK_WEB_SEARCH_INPUT_SCHEMA,
  validateInput: isMockWebSearchInput,
  approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS },
  execute: (input) => {
    const query = readMockWebSearchQuery(input);
    return Promise.resolve({
      query,
      summary: `Mocked web search found briefing-style context for "${query}".`,
      results: [
        {
          title: "Mock Search Result",
          url: "https://example.test/search-result",
          snippet: "This deterministic result behaves like web search without leaving the backend.",
        },
      ],
    });
  },
});

function isMockWebSearchInput(input: unknown): input is MockWebSearchInput {
  return isRecord(input) && typeof input["query"] === "string" && input["query"].trim().length > 0;
}

function readMockWebSearchQuery(input: JsonValue): string {
  if (!isMockWebSearchInput(input)) {
    throw new TypeError("mock_web_search requires a non-empty query string");
  }
  return input.query.trim();
}
