import type { JsonObject } from "@side-chat/chat-protocol";

import type { RuntimeTool } from "./tool-registry.js";

export const MOCK_WEB_SEARCH_TOOL_NAME = "mock_web_search" as const;

export type MockWebSearchInput = JsonObject & {
  readonly query: string;
};

export type MockWebSearchResult = JsonObject & {
  readonly query: string;
  readonly summary: string;
  readonly results: JsonObject[];
};

const DEFAULT_MOCK_WEB_SEARCH_DELAY_MS = 5000;

export const createMockWebSearchTool = ({
  delayMs = DEFAULT_MOCK_WEB_SEARCH_DELAY_MS,
}: {
  readonly delayMs?: number;
} = {}): RuntimeTool => ({
  name: MOCK_WEB_SEARCH_TOOL_NAME,
  description:
    "Search the web for recent or external information. Use this when the user asks to search, look up current information, or find sources outside the conversation.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The web search query to run.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  readSources: (result) => readSources(result),
  run: async (input) => {
    if (delayMs > 0) await wait(delayMs);

    return {
      query: readQuery(input),
      summary: `Mocked web search found briefing-style context for "${readQuery(input)}".`,
      results: [
        {
          title: "Mock Search Result",
          url: "https://example.test/search-result",
          snippet:
            "This is a deterministic mocked result. It behaves like web search without leaving the backend.",
        },
      ],
    };
  },
});

const readQuery = (input: JsonObject): string =>
  typeof input["query"] === "string" ? input["query"] : "";

const readSources = (result: JsonObject) => {
  const results = result["results"];
  if (!Array.isArray(results)) return [];

  return results.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry["url"] !== "string") return [];
    return [
      {
        label: typeof entry["title"] === "string" ? entry["title"] : new URL(entry["url"]).hostname,
        url: entry["url"],
      },
    ];
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const wait = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
