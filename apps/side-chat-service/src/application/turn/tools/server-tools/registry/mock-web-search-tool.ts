import { isRecord, type JsonValue } from "@side-chat/shared";

import {
  SERVER_TOOL_APPROVAL_POLICIES,
  defineServerTool,
  type ServerToolExecutionContext,
} from "../server-tool-catalog.js";

export const DEFAULT_MOCK_WEB_SEARCH_MODEL_ID = "gpt-5.4-mini";
export const DEFAULT_MOCK_WEB_SEARCH_RESULT_COUNT = 5;
export const MOCK_WEB_SEARCH_TOOL_NAME = "mock_web_search";
export const MOCK_WEB_SEARCH_TOOL_DESCRIPTION =
  "Search the web for recent or external information. Use this when the user asks to search, look up current information, or find sources outside the conversation.";

export const DEFAULT_MOCK_WEB_SEARCH_AGENT_PROMPT =
  'You are the backend of a web search engine. Given a search query, respond with ONLY a JSON array of result objects — no prose, no markdown, no code fences. Each object has exactly three string fields: "title" (the page title), "url" (a plausible, real-looking https:// URL on a relevant domain), and "snippet" (one or two sentences summarising the page). Invent realistic, varied results from your own knowledge; never state or imply that the results are simulated.';

const MOCK_WEB_SEARCH_MAX_OUTPUT_TOKENS = 2_048;

type MockWebSearchInput = Readonly<{ query: string }>;
type MockSearchResult = Readonly<{
  title: string;
  url: string;
  snippet: string;
}>;
type MockWebSearchOutput = Readonly<{
  query: string;
  summary: string;
  results: readonly MockSearchResult[];
}>;

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

/** Model-backed search simulation. The nested model call is supplied only by the approved step. */
export const MOCK_WEB_SEARCH_TOOL = defineServerTool<JsonValue, MockWebSearchOutput>({
  name: MOCK_WEB_SEARCH_TOOL_NAME,
  description: MOCK_WEB_SEARCH_TOOL_DESCRIPTION,
  inputSchema: MOCK_WEB_SEARCH_INPUT_SCHEMA,
  validateInput: isMockWebSearchInput,
  approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS },
  internalModelIds: [DEFAULT_MOCK_WEB_SEARCH_MODEL_ID],
  readSources: (output) =>
    output.results.map((result) => ({ label: result.title, url: result.url })),
  execute: async (input, context) => {
    const query = readMockWebSearchQuery(input);
    const results = await runSearchModel(query, context);
    return results.length > 0 ? modelSearchResult(query, results) : cannedResult(query);
  },
});

async function runSearchModel(
  query: string,
  context: ServerToolExecutionContext,
): Promise<MockSearchResult[]> {
  if (context.generateText === undefined) return [];
  try {
    const output = await context.generateText({
      modelId: DEFAULT_MOCK_WEB_SEARCH_MODEL_ID,
      system: DEFAULT_MOCK_WEB_SEARCH_AGENT_PROMPT,
      prompt: `Search query: ${query}\n\nReturn exactly ${DEFAULT_MOCK_WEB_SEARCH_RESULT_COUNT} results as a JSON array.`,
      maxOutputTokens: MOCK_WEB_SEARCH_MAX_OUTPUT_TOKENS,
    });
    return parseMockSearchResults(output, DEFAULT_MOCK_WEB_SEARCH_RESULT_COUNT);
  } catch {
    // Search simulation is non-critical: provider or parsing failures use a safe local result.
    return [];
  }
}

export function parseMockSearchResults(text: string, max: number): MockSearchResult[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .flatMap((entry): MockSearchResult[] => {
      if (!isRecord(entry)) return [];
      const title = entry["title"];
      const url = entry["url"];
      if (typeof title !== "string" || typeof url !== "string") return [];
      const snippet = typeof entry["snippet"] === "string" ? entry["snippet"] : "";
      return [{ title, url, snippet }];
    })
    .slice(0, max);
}

function modelSearchResult(
  query: string,
  results: readonly MockSearchResult[],
): MockWebSearchOutput {
  return {
    query,
    summary: `Mocked web search found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}".`,
    results,
  };
}

function cannedResult(query: string): MockWebSearchOutput {
  return {
    query,
    summary: `Mocked web search found briefing-style context for "${query}".`,
    results: [
      {
        title: "Mock Search Result",
        url: "https://example.test/search-result",
        snippet:
          "This is a deterministic mocked result. It behaves like web search without leaving the backend.",
      },
    ],
  };
}

function isMockWebSearchInput(input: unknown): input is MockWebSearchInput {
  return isRecord(input) && typeof input["query"] === "string" && input["query"].trim().length > 0;
}

function readMockWebSearchQuery(input: JsonValue): string {
  if (!isMockWebSearchInput(input)) {
    throw new TypeError("mock_web_search requires a non-empty query string");
  }
  return input.query.trim();
}
