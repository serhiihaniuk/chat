import { Effect } from "effect";
import { isRecord, type JsonObject } from "@side-chat/shared";

import type { RuntimeTool } from "#tools/tool-registry";

export const MOCK_WEB_SEARCH_TOOL_NAME = "mock_web_search" as const;

export const createMockWebSearchTool = (): RuntimeTool => ({
  name: MOCK_WEB_SEARCH_TOOL_NAME,
  description: "Search deterministic fixture data.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  readSources: (result) => readSources(result),
  execute: (input) =>
    Effect.succeed({
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
    }),
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
