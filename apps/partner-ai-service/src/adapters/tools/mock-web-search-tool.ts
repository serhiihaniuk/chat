import { Effect, Stream } from "effect";
import {
  createBasicRuntimeAgent,
  DEFAULT_AGENT_EXECUTOR_ID,
  type RuntimeTool,
  type RuntimeToolContext,
} from "@side-chat/agent-runtime";
import {
  AiRuntimeError,
  RUNTIME_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  toAssistantTurnId,
  toModelId,
  toRequestId,
} from "@side-chat/ai-runtime-contract";
import { isRecord, type JsonObject } from "@side-chat/shared";
import {
  createServiceToolRegistration,
  type ServiceToolRuntimeAccessor,
  type ServiceToolRegistration,
} from "#composition/tools/service-tool-registry";

export const DEFAULT_MOCK_WEB_SEARCH_DELAY_MS = 5000;
export const DEFAULT_MOCK_WEB_SEARCH_RESULT_COUNT = 5;
export const DEFAULT_MOCK_WEB_SEARCH_MODEL_ID = "gpt-5.4-mini";
export const MOCK_WEB_SEARCH_TOOL_NAME = "mock_web_search";
export const MOCK_WEB_SEARCH_TOOL_LABEL = "Mock web search";
export const MOCK_WEB_SEARCH_TOOL_DESCRIPTION =
  "Search the web for recent or external information. Use this when the user asks to search, look up current information, or find sources outside the conversation.";

// The search sub-agent's system prompt. It pretends to BE a search engine so the
// main model receives ordinary-looking results and never learns they are fabricated.
export const DEFAULT_MOCK_WEB_SEARCH_AGENT_PROMPT =
  'You are the backend of a web search engine. Given a search query, respond with ONLY a JSON array of result objects — no prose, no markdown, no code fences. Each object has exactly three string fields: "title" (the page title), "url" (a plausible, real-looking https:// URL on a relevant domain), and "snippet" (one or two sentences summarising the page). Invent realistic, varied results from your own knowledge; never state or imply that the results are simulated.';

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

type MockSearchResult = { title: string; url: string; snippet: string };

export type MockWebSearchAgentConfig = {
  readonly resultCount?: number;
  readonly modelId?: string;
  readonly systemPrompt?: string;
};

/**
 * Late-binding accessor for the sub-agent's runtime.
 *
 * The runtime is built from the tools, so this tool cannot capture it at
 * construction. Its registry supplies a composition-local accessor and fills
 * that registry's handle once composition has built the runtime. An unset
 * accessor (a title job or direct unit test) degrades to the canned result.
 */
export type MockWebSearchRuntimeAccessor = ServiceToolRuntimeAccessor;

/**
 * Provide a local/development web-search fixture.
 *
 * It normally runs a small model-only sub-agent and returns ordinary search-like
 * results to the main model. The sub-agent gets its runtime from the local
 * composition. If that runtime is missing or the sub-agent fails, return a
 * deterministic canned result so the turn still completes.
 */
export const createMockWebSearchTool = ({
  delayMs = DEFAULT_MOCK_WEB_SEARCH_DELAY_MS,
  description = MOCK_WEB_SEARCH_TOOL_DESCRIPTION,
  resultCount = DEFAULT_MOCK_WEB_SEARCH_RESULT_COUNT,
  modelId = DEFAULT_MOCK_WEB_SEARCH_MODEL_ID,
  systemPrompt = DEFAULT_MOCK_WEB_SEARCH_AGENT_PROMPT,
  getRuntime = () => undefined,
}: {
  readonly delayMs?: number;
  readonly description?: string;
  readonly getRuntime?: MockWebSearchRuntimeAccessor;
} & MockWebSearchAgentConfig = {}): RuntimeTool => ({
  name: MOCK_WEB_SEARCH_TOOL_NAME,
  description,
  inputSchema: MOCK_WEB_SEARCH_INPUT_SCHEMA,
  readSources: (result) => readSources(result),
  execute: (input, context) =>
    Effect.gen(function* () {
      const query = yield* readQuery(input);
      const results = yield* runSearchAgent(query, context, getRuntime, {
        resultCount,
        modelId,
        systemPrompt,
      });
      if (results.length > 0) {
        return {
          query,
          summary: `Mocked web search found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}".`,
          results,
        };
      }
      // No sub-agent (handle unset in this context) or it failed: canned fallback.
      if (delayMs > 0) yield* Effect.sleep(delayMs);
      return cannedResult(query);
    }).pipe(Effect.mapError(toToolError)),
});

/**
 * Run the search sub-agent for a query, returning parsed results or `[]`.
 *
 * The error channel is folded to `[]` (catchAll) so any sub-agent failure — an
 * unset runtime handle, a model error, empty or unparseable output — degrades to
 * the caller's canned fallback rather than failing the whole turn.
 */
const runSearchAgent = (
  query: string,
  context: RuntimeToolContext,
  getRuntime: MockWebSearchRuntimeAccessor,
  config: Required<MockWebSearchAgentConfig>,
): Effect.Effect<MockSearchResult[], never> => {
  const runtime = getRuntime();
  if (!runtime || !context.providerId || !context.scope) {
    return Effect.succeed<MockSearchResult[]>([]);
  }

  const agent = createBasicRuntimeAgent(runtime, {
    executorId: DEFAULT_AGENT_EXECUTOR_ID,
    providerId: context.providerId,
    modelId: toModelId(config.modelId),
    toolScope: context.scope,
    toolNames: [],
    systemInstructions: config.systemPrompt,
  });

  return Effect.gen(function* () {
    let output = "";
    yield* Stream.runForEach(
      agent.streamEffect({
        requestId: toRequestId(`${context.requestId}:mock-web-search`),
        assistantTurnId: toAssistantTurnId(`${context.assistantTurnId}:mock-web-search`),
        messages: [
          {
            role: "user",
            content: `Search query: ${query}\n\nReturn exactly ${config.resultCount} results as a JSON array.`,
          },
        ],
        abortSignal: context.abortSignal,
      }),
      (event) =>
        Effect.sync(() => {
          if (event.type === RUNTIME_EVENT_TYPES.OUTPUT_DELTA) output += event.content;
        }),
    );
    return parseMockSearchResults(output, config.resultCount);
  }).pipe(Effect.catch(() => Effect.succeed<MockSearchResult[]>([])));
};

// The sub-agent is asked for a bare JSON array, but models sometimes wrap it in
// prose or a code fence; slice from the first "[" to the last "]" before parsing,
// and drop any entry missing a title or url. Exported for direct unit testing.
export const parseMockSearchResults = (text: string, max: number): MockSearchResult[] => {
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
};

const cannedResult = (query: string): JsonObject => ({
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
  label = MOCK_WEB_SEARCH_TOOL_LABEL,
  resultCount = DEFAULT_MOCK_WEB_SEARCH_RESULT_COUNT,
  modelId = DEFAULT_MOCK_WEB_SEARCH_MODEL_ID,
  systemPrompt = DEFAULT_MOCK_WEB_SEARCH_AGENT_PROMPT,
}: {
  readonly delayMs?: number;
  readonly description?: string;
  readonly defaultEnabled?: boolean;
  readonly label?: string;
} & MockWebSearchAgentConfig = {}): ServiceToolRegistration => {
  return createServiceToolRegistration({
    capability: {
      name: MOCK_WEB_SEARCH_TOOL_NAME,
      description,
      inputSchema: MOCK_WEB_SEARCH_INPUT_SCHEMA,
    },
    createRuntimeTool: (getRuntime) =>
      createMockWebSearchTool({
        delayMs,
        description,
        resultCount,
        modelId,
        systemPrompt,
        getRuntime,
      }),
    defaultEnabled,
    label,
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
