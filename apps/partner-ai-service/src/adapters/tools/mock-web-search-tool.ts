import { Effect } from "effect";
import { AiRuntimeError, RUNTIME_ERROR_CODES } from "@side-chat/ai-runtime-contract";
import type { RuntimeTool } from "@side-chat/agent-runtime";
import { isRecord, type JsonObject } from "@side-chat/shared";
import {
  createServiceToolRegistration,
  type ServiceToolRegistration,
} from "#composition/tools/service-tool-registry";

export const DEFAULT_MOCK_WEB_SEARCH_DELAY_MS = 5000;
export const MOCK_WEB_SEARCH_TOOL_NAME = "mock_web_search";
export const MOCK_WEB_SEARCH_TOOL_DESCRIPTION =
  "Search the web for recent or external information. Use this when the user asks to search, look up current information, or find sources outside the conversation.";
export const MOCK_WEB_SEARCH_INPUT_SCHEMA = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "The web search query to run.",
    },
  },
  required: ["query"],
  additionalProperties: false,
} as const satisfies JsonObject;

// Local/dev tool fixture. It is deterministic and never calls the external web.
export const createMockWebSearchTool = ({
  delayMs = DEFAULT_MOCK_WEB_SEARCH_DELAY_MS,
  description = MOCK_WEB_SEARCH_TOOL_DESCRIPTION,
}: {
  readonly delayMs?: number;
  readonly description?: string;
} = {}): RuntimeTool => ({
  name: MOCK_WEB_SEARCH_TOOL_NAME,
  description,
  inputSchema: MOCK_WEB_SEARCH_INPUT_SCHEMA,
  readSources: (result) => readSources(result),
  execute: (input) =>
    Effect.gen(function* () {
      const query = yield* readQuery(input);
      if (delayMs > 0) yield* Effect.sleep(delayMs);

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
    }).pipe(Effect.mapError(toToolError)),
});

/**
 * Bundle the mock web search capability and executable as one registration.
 *
 * This keeps the local/dev fixture on the single registry path: enabling it adds
 * the manifest capability and the runtime executable together, never as two
 * independent wiring steps.
 */
export const createMockWebSearchRegistration = ({
  delayMs = DEFAULT_MOCK_WEB_SEARCH_DELAY_MS,
  description = MOCK_WEB_SEARCH_TOOL_DESCRIPTION,
  defaultEnabled = true,
  approvalPolicyIds = [],
}: {
  readonly delayMs?: number;
  readonly description?: string;
  readonly defaultEnabled?: boolean;
  readonly approvalPolicyIds?: readonly string[];
} = {}): ServiceToolRegistration => {
  const runtimeTool = createMockWebSearchTool({ delayMs, description });
  return createServiceToolRegistration({
    capability: {
      name: MOCK_WEB_SEARCH_TOOL_NAME,
      description: runtimeTool.description,
      inputSchema: MOCK_WEB_SEARCH_INPUT_SCHEMA,
    },
    runtimeTool,
    defaultEnabled,
    approvalPolicyIds,
  });
};

const readQuery = (input: JsonObject): Effect.Effect<string, AiRuntimeError> => {
  const query = input["query"];
  if (typeof query === "string" && query.trim().length > 0) return Effect.succeed(query.trim());

  return Effect.fail(
    new AiRuntimeError(
      RUNTIME_ERROR_CODES.TOOL_FAILED,
      "mock_web_search requires a non-empty query string.",
    ),
  );
};

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

const toToolError = (error: unknown): AiRuntimeError => {
  if (error instanceof AiRuntimeError) return error;
  return new AiRuntimeError(
    RUNTIME_ERROR_CODES.TOOL_FAILED,
    error instanceof Error ? error.message : "mock_web_search failed.",
  );
};
