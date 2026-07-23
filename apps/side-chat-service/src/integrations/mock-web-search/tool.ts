import { isRecord, type JsonValue } from "@side-chat/shared";
import {
  SERVER_TOOL_APPROVAL_POLICIES,
  defineServerTool,
  type ServerToolExecutionContext,
} from "@side-chat/side-chat-server";

export const DEFAULT_MOCK_WEB_SEARCH_MODEL_ID = "gpt-5.4-mini";
export const DEFAULT_MOCK_WEB_SEARCH_RESULT_COUNT = 5;
export const MOCK_WEB_SEARCH_TOOL_NAME = "mock_web_search";
export const MOCK_WEB_SEARCH_TOOL_DESCRIPTION =
  "Generate simulated web-search-style examples for local demos. This tool does not access the web and its output is not factual evidence.";

export const DEFAULT_MOCK_WEB_SEARCH_AGENT_PROMPT =
  'Generate fictional web-search-style examples for a local demo. Respond with ONLY a JSON array of result objects - no prose, markdown, or code fences. Each object has exactly three string fields: "title", "url", and "snippet". Every URL must use the reserved https://example.test domain. The results are simulated, not retrieved or current, and must never be presented as factual sources.';

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
      if (typeof title !== "string" || typeof url !== "string" || !isSimulationUrl(url)) return [];
      const snippet = typeof entry["snippet"] === "string" ? entry["snippet"] : "";
      return [{ title, url, snippet }];
    })
    .slice(0, max);
}

function isSimulationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "example.test";
  } catch {
    return false;
  }
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
