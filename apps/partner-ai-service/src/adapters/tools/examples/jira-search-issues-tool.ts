import { Effect } from "effect";
import {
  AiRuntimeError,
  RUNTIME_ERROR_CODES,
  type RuntimeActivitySource,
} from "@side-chat/ai-runtime-contract";
import {
  createRuntimeToolFromPromise,
  type RuntimeTool,
  type RuntimeToolContext,
  type RuntimeToolScope,
} from "@side-chat/agent-runtime";
import { compactJsonObject, isRecord, type JsonObject } from "@side-chat/shared";
import {
  createServiceToolRegistration,
  type ServiceToolRegistration,
} from "#composition/tools/service-tool-registry";

export const JIRA_SEARCH_ISSUES_TOOL_NAME = "jira.search_issues";

export const JIRA_SEARCH_ISSUES_INPUT_SCHEMA = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Jira issue search text or JQL fragment.",
    },
    maxResults: {
      type: "integer",
      minimum: 1,
      maximum: 25,
      description: "Maximum issues to return.",
    },
  },
  required: ["query"],
  additionalProperties: false,
} as const satisfies JsonObject;

const JIRA_TOOL_DESCRIPTION =
  "Search Jira issues the current user may access. Use this for questions about tickets, bugs, epics, or project work items.";

export type JiraIssue = {
  readonly key: string;
  readonly summary: string;
  readonly status: string;
  readonly url?: string;
};

export type JiraSearchIssuesRequest = {
  readonly query: string;
  readonly maxResults: number;
  readonly requestId: string;
  readonly hostAppId: string;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly abortSignal?: AbortSignal | undefined;
};

/**
 * The adopter's Jira client, owning Jira auth and visibility checks.
 *
 * Modeled as a plain Promise (most SDKs are promise-based). The tool passes the
 * primitive runtime scope into it and normalizes the visible issues into
 * runtime-safe JSON.
 */
export type JiraClient = {
  readonly searchIssues: (request: JiraSearchIssuesRequest) => Promise<readonly JiraIssue[]>;
};

/**
 * Bundle the Jira search capability and executable as one registration.
 *
 * The manifest capability and the matching `RuntimeTool` come from one factory,
 * so the declared tool always has an executable behind it. This uses the promise
 * flavor below; swap in `createJiraSearchIssuesToolEffect` for the Effect variant.
 */
export const createJiraSearchIssuesRegistration = ({
  jiraClient,
}: {
  readonly jiraClient: JiraClient;
}): ServiceToolRegistration =>
  createServiceToolRegistration({
    capability: {
      name: JIRA_SEARCH_ISSUES_TOOL_NAME,
      description: "Search Jira issues visible to the current user.",
      inputSchema: JIRA_SEARCH_ISSUES_INPUT_SCHEMA,
    },
    runtimeTool: createJiraSearchIssuesTool({ jiraClient }),
  });

/**
 * Flavor 1 (recommended) — a plain async function via `createRuntimeToolFromPromise`.
 *
 * No Effect knowledge needed: `run` returns the JSON result or throws. Invalid
 * input or missing scope throw a typed `AiRuntimeError` whose safe message is
 * preserved; a thrown client failure is scrubbed to a stable `tool_failed`
 * message by the wrapper, so raw Jira errors never reach the model.
 */
export const createJiraSearchIssuesTool = ({
  jiraClient,
}: {
  readonly jiraClient: JiraClient;
}): RuntimeTool =>
  createRuntimeToolFromPromise({
    name: JIRA_SEARCH_ISSUES_TOOL_NAME,
    description: JIRA_TOOL_DESCRIPTION,
    inputSchema: JIRA_SEARCH_ISSUES_INPUT_SCHEMA,
    readSources: readJiraIssueSources,
    run: async (input, context) => {
      const { query, maxResults } = readJiraSearchIssuesInput(input);
      const scope = readJiraToolScope(context);
      const issues = await jiraClient.searchIssues(
        jiraRequest(query, maxResults, context.requestId, scope, context.abortSignal),
      );
      return toJiraSearchIssuesResult(issues);
    },
  });

/**
 * Flavor 2 (advanced) — the same tool written directly as an Effect program.
 *
 * Choose this for explicit typed failures and interruption. It wraps the same
 * promise client through `Effect.tryPromise`; `toJiraToolError` keeps a
 * deliberately thrown `AiRuntimeError` and reduces anything else to a safe message.
 */
export const createJiraSearchIssuesToolEffect = ({
  jiraClient,
}: {
  readonly jiraClient: JiraClient;
}): RuntimeTool => ({
  name: JIRA_SEARCH_ISSUES_TOOL_NAME,
  description: JIRA_TOOL_DESCRIPTION,
  inputSchema: JIRA_SEARCH_ISSUES_INPUT_SCHEMA,
  readSources: readJiraIssueSources,
  execute: (input, context) =>
    Effect.gen(function* () {
      const parsed = yield* Effect.try({
        try: () => readJiraSearchIssuesInput(input),
        catch: toJiraToolError,
      });
      const scope = yield* Effect.try({
        try: () => readJiraToolScope(context),
        catch: toJiraToolError,
      });
      const issues = yield* Effect.tryPromise({
        try: (signal) =>
          jiraClient.searchIssues(
            jiraRequest(parsed.query, parsed.maxResults, context.requestId, scope, signal),
          ),
        catch: toJiraToolError,
      });
      return toJiraSearchIssuesResult(issues);
    }),
});

const jiraRequest = (
  query: string,
  maxResults: number,
  requestId: string,
  scope: RuntimeToolScope,
  abortSignal: AbortSignal | undefined,
): JiraSearchIssuesRequest => ({
  query,
  maxResults,
  requestId,
  hostAppId: scope.hostAppId,
  workspaceId: scope.workspaceId,
  subjectId: scope.subjectId,
  conversationId: scope.conversationId,
  assistantTurnId: scope.assistantTurnId,
  abortSignal,
});

const readJiraToolScope = (context: RuntimeToolContext): RuntimeToolScope => {
  if (!context.scope) {
    throw new AiRuntimeError(
      RUNTIME_ERROR_CODES.TOOL_FAILED,
      "jira.search_issues requires runtime tool scope.",
    );
  }
  return context.scope;
};

const readJiraSearchIssuesInput = (
  input: JsonObject,
): { readonly query: string; readonly maxResults: number } => {
  const query = input["query"];
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new AiRuntimeError(
      RUNTIME_ERROR_CODES.TOOL_FAILED,
      "jira.search_issues requires a non-empty query string.",
    );
  }
  return { query: query.trim(), maxResults: readMaxResults(input["maxResults"]) };
};

const readMaxResults = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 25 ? value : 10;

const toJiraSearchIssuesResult = (issues: readonly JiraIssue[]): JsonObject => ({
  count: issues.length,
  issues: issues.map((issue) =>
    compactJsonObject({
      key: issue.key,
      summary: issue.summary,
      status: issue.status,
      url: issue.url,
    }),
  ),
});

const readJiraIssueSources = (result: JsonObject): readonly RuntimeActivitySource[] => {
  const issues = result["issues"];
  if (!Array.isArray(issues)) return [];

  return issues.flatMap((issue) => {
    if (!isRecord(issue) || typeof issue["url"] !== "string") return [];

    return [
      {
        label: readJiraIssueSourceLabel(issue),
        url: issue["url"],
      },
    ];
  });
};

const readJiraIssueSourceLabel = (issue: Record<string, unknown>): string => {
  if (typeof issue["key"] === "string") return issue["key"];
  if (typeof issue["summary"] === "string") return issue["summary"];
  return "Jira issue";
};

const toJiraToolError = (error: unknown): AiRuntimeError =>
  error instanceof AiRuntimeError
    ? error
    : new AiRuntimeError(RUNTIME_ERROR_CODES.TOOL_FAILED, "jira.search_issues failed.");
