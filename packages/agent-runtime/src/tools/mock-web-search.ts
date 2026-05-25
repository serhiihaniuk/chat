import type { JsonObject } from "@side-chat/chat-protocol";

import type { RuntimeTool, RuntimeToolRequest } from "./tool-registry.js";

export const MOCK_WEB_SEARCH_TOOL_NAME = "mock_web_search" as const;

export type MockWebSearchInput = JsonObject & {
  readonly query: string;
};

export type MockWebSearchResult = JsonObject & {
  readonly query: string;
  readonly summary: string;
  readonly results: JsonObject[];
};

const DEFAULT_MOCK_WEB_SEARCH_DELAY_MS = 3000;

export const createMockWebSearchTool = ({
  delayMs = DEFAULT_MOCK_WEB_SEARCH_DELAY_MS,
}: {
  readonly delayMs?: number;
} = {}): RuntimeTool => ({
  name: MOCK_WEB_SEARCH_TOOL_NAME,
  description:
    "Mocked web search tool that simulates looking up external information before answering.",
  createInput: (request) => ({ query: lastUserText(request) }),
  shouldInvoke: (request) => shouldSearchWeb(lastUserText(request)),
  progress: () => [
    "Searching the web\n",
    "Scanning mocked result pages and checking snippets...\n",
  ],
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

const lastUserText = (request: RuntimeToolRequest): string =>
  [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";

const readQuery = (input: JsonObject): string =>
  typeof input["query"] === "string" ? input["query"] : "";

const shouldSearchWeb = (text: string): boolean =>
  /\b(search|web|latest|current|today|news|lookup|look up|find)\b/iu.test(text);

const wait = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
