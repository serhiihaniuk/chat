import { Effect } from "effect";
import {
  AgentRuntimeError,
  RUNTIME_ERROR_CODES,
  type RuntimeActivitySource,
  type RuntimeTool,
  type RuntimeToolContext,
  type RuntimeToolScope,
} from "@side-chat/agent-runtime";
import type { ToolCapability } from "@side-chat/partner-ai-core";
import { compactJsonObject, isRecord, type JsonObject } from "@side-chat/shared";

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
  readonly profileId: string;
  readonly abortSignal?: AbortSignal | undefined;
};

/**
 * Concrete Jira clients own Jira auth and visibility checks.
 *
 * This example tool passes primitive runtime scope into that app-owned client
 * and normalizes the visible issues into runtime-safe JSON.
 */
export type JiraClient = {
  readonly searchIssues: (
    request: JiraSearchIssuesRequest,
  ) => Effect.Effect<readonly JiraIssue[], unknown>;
};

export const createJiraSearchIssuesCapability = (): ToolCapability => ({
  name: JIRA_SEARCH_ISSUES_TOOL_NAME,
  description: "Search Jira issues visible to the current user.",
  inputSchema: JIRA_SEARCH_ISSUES_INPUT_SCHEMA,
});

export const createJiraSearchIssuesTool = ({
  jiraClient,
}: {
  readonly jiraClient: JiraClient;
}): RuntimeTool => ({
  name: JIRA_SEARCH_ISSUES_TOOL_NAME,
  description:
    "Search Jira issues the current user may access. Use this for questions about tickets, bugs, epics, or project work items.",
  inputSchema: JIRA_SEARCH_ISSUES_INPUT_SCHEMA,
  readSources: readJiraIssueSources,
  execute: (input, context) =>
    Effect.gen(function* () {
      const searchInput = yield* readJiraSearchIssuesInput(input);
      const scope = yield* readJiraToolScope(context);
      const issues = yield* jiraClient
        .searchIssues({
          query: searchInput.query,
          maxResults: searchInput.maxResults,
          requestId: context.requestId,
          hostAppId: scope.hostAppId,
          workspaceId: scope.workspaceId,
          subjectId: scope.subjectId,
          conversationId: scope.conversationId,
          assistantTurnId: scope.assistantTurnId,
          profileId: scope.profileId,
          abortSignal: context.abortSignal,
        })
        .pipe(Effect.mapError(toJiraToolError));

      return toJiraSearchIssuesResult(issues);
    }).pipe(Effect.mapError(toJiraToolError)),
});

const readJiraToolScope = (
  context: RuntimeToolContext,
): Effect.Effect<RuntimeToolScope, AgentRuntimeError> =>
  context.scope
    ? Effect.succeed(context.scope)
    : Effect.fail(
        new AgentRuntimeError(
          RUNTIME_ERROR_CODES.TOOL_FAILED,
          "jira.search_issues requires runtime tool scope.",
        ),
      );

const readJiraSearchIssuesInput = (
  input: JsonObject,
): Effect.Effect<{ readonly query: string; readonly maxResults: number }, AgentRuntimeError> => {
  const query = input["query"];
  if (typeof query !== "string" || query.trim().length === 0) {
    return Effect.fail(
      new AgentRuntimeError(
        RUNTIME_ERROR_CODES.TOOL_FAILED,
        "jira.search_issues requires a non-empty query string.",
      ),
    );
  }

  return Effect.succeed({
    query: query.trim(),
    maxResults: readMaxResults(input["maxResults"]),
  });
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

const toJiraToolError = (error: unknown): AgentRuntimeError => {
  if (error instanceof AgentRuntimeError) return error;
  return new AgentRuntimeError(
    RUNTIME_ERROR_CODES.TOOL_FAILED,
    error instanceof Error ? error.message : "jira.search_issues failed.",
  );
};
