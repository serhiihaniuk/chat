import { Effect } from "effect";
import { RUNTIME_ERROR_CODES } from "@side-chat/ai-runtime-contract";
import type { RuntimeTool, RuntimeToolContext } from "@side-chat/agent-runtime";
import { describe, expect, it } from "vitest";
import {
  createJiraSearchIssuesTool,
  createJiraSearchIssuesToolEffect,
  JIRA_SEARCH_ISSUES_TOOL_NAME,
  type JiraClient,
  type JiraSearchIssuesRequest,
} from "./jira-search-issues-tool.js";

// Both authoring flavors must behave identically at the runtime boundary.
const flavors: readonly [string, (deps: { readonly jiraClient: JiraClient }) => RuntimeTool][] = [
  ["promise flavor", createJiraSearchIssuesTool],
  ["effect flavor", createJiraSearchIssuesToolEffect],
];

describe.each(flavors)("jira search issues runtime tool example (%s)", (_label, createTool) => {
  it("passes request context to the Jira client and normalizes results", async () => {
    const requests: JiraSearchIssuesRequest[] = [];
    const tool = createTool({
      jiraClient: {
        searchIssues: (request) => {
          requests.push(request);
          return Promise.resolve([
            {
              key: "SC-42",
              summary: "Adopt assistant architecture",
              status: "In Progress",
              url: "https://jira.example.test/browse/SC-42",
            },
          ]);
        },
      },
    });

    const result = await Effect.runPromise(
      tool.execute({ query: " architecture ", maxResults: 5 }, toolContext),
    );

    expect(requests[0]).toMatchObject({
      query: "architecture",
      maxResults: 5,
      requestId: "request_jira_001",
      hostAppId: "host_jira_001",
      workspaceId: "workspace_jira_001",
      subjectId: "subject_jira_001",
      conversationId: "conversation_jira_001",
      assistantTurnId: "turn_jira_001",
    });
    expect(result).toMatchObject({
      count: 1,
      issues: [
        {
          key: "SC-42",
          summary: "Adopt assistant architecture",
          status: "In Progress",
          url: "https://jira.example.test/browse/SC-42",
        },
      ],
    });
    expect(tool.readSources?.(result)).toEqual([
      { label: "SC-42", url: "https://jira.example.test/browse/SC-42" },
    ]);
  });

  it("fails closed when enterprise runtime scope is missing", async () => {
    const tool = createTool({ jiraClient: { searchIssues: () => Promise.resolve([]) } });

    await expect(
      Effect.runPromise(tool.execute({ query: "SC" }, toolContextWithoutScope)),
    ).rejects.toMatchObject({
      code: RUNTIME_ERROR_CODES.TOOL_FAILED,
      message: "jira.search_issues requires runtime tool scope.",
    });
  });

  it("rejects invalid input as a runtime-safe tool failure", async () => {
    const tool = createTool({ jiraClient: { searchIssues: () => Promise.resolve([]) } });

    await expect(Effect.runPromise(tool.execute({}, toolContext))).rejects.toMatchObject({
      code: RUNTIME_ERROR_CODES.TOOL_FAILED,
      message: "jira.search_issues requires a non-empty query string.",
    });
  });

  it("scrubs a client failure to a runtime-safe tool error", async () => {
    const tool = createTool({
      jiraClient: {
        searchIssues: () => Promise.reject(new Error("Jira auth failed: token=secret")),
      },
    });

    const failure = await Effect.runPromise(
      Effect.flip(tool.execute({ query: "SC" }, toolContext)),
    );
    expect(failure.code).toBe(RUNTIME_ERROR_CODES.TOOL_FAILED);
    // The raw client error must never reach the model.
    expect(failure.message).toBe("jira.search_issues failed.");
    expect(failure.message).not.toContain("secret");
  });
});

const toolContextWithoutScope: RuntimeToolContext = {
  requestId: "request_jira_001",
  assistantTurnId: "turn_jira_001",
  providerId: "fake",
  modelId: "fake-echo",
  toolName: JIRA_SEARCH_ISSUES_TOOL_NAME,
};

const toolContext: RuntimeToolContext = {
  ...toolContextWithoutScope,
  scope: {
    hostAppId: "host_jira_001",
    workspaceId: "workspace_jira_001",
    subjectId: "subject_jira_001",
    conversationId: "conversation_jira_001",
    assistantTurnId: "turn_jira_001",
  },
};
