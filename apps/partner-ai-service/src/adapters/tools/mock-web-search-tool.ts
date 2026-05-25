import { Effect } from "effect";
import { AgentRuntimeError, type RuntimeTool } from "@side-chat/agent-runtime";
import type { JsonObject } from "@side-chat/chat-protocol";

const DEFAULT_MOCK_WEB_SEARCH_DELAY_MS = 5000;

export const createMockWebSearchTool = ({
  delayMs = DEFAULT_MOCK_WEB_SEARCH_DELAY_MS,
}: {
  readonly delayMs?: number;
} = {}): RuntimeTool => ({
  name: "mock_web_search",
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
  execute: (input, context) =>
    Effect.tryPromise({
      try: async (signal) => {
        if (delayMs > 0) await wait(delayMs, context.abortSignal ?? signal);

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
      catch: (error) => toToolError(error),
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

const toToolError = (error: unknown): AgentRuntimeError => {
  if (error instanceof AgentRuntimeError) return error;
  return new AgentRuntimeError(
    "tool_failed",
    error instanceof Error ? error.message : "mock_web_search failed.",
  );
};

const wait = (durationMs: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(readAbortReason(signal));
      return;
    }

    const timeout = setTimeout(resolve, durationMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(readAbortReason(signal));
      },
      { once: true },
    );
  });

const readAbortReason = (signal: AbortSignal): Error => {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error("mock_web_search aborted.");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
