import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import {
  createJiraSearchIssuesCapability,
  createJiraSearchIssuesTool,
  JIRA_SEARCH_ISSUES_TOOL_NAME,
} from "#adapters/tools/examples/jira-search-issues-tool";
import { composePartnerAiService } from "./service-composition.js";

const workspace = {
  tenantId: "tenant_tools",
  workspaceId: "workspace_tools",
} as const;

const authContext = {
  tenantId: "tenant_tools",
  workspaceId: "workspace_tools",
  subject: { subjectId: "subject_1", userId: "user_1" },
  actor: { subjectId: "subject_1", userId: "user_1" },
  roles: ["member"],
  scopes: ["conversation:read", "conversation:write", "message:write"],
  source: "test_authority",
  issuedAt: "2026-05-23T13:00:00.000Z",
} as const;

describe("service composition runtime tools", () => {
  it("keeps enterprise tool declarations and executable registrations separate", async () => {
    const composition = composePartnerAiService({
      workspace,
      runtime: {
        provider: "fake",
        toolCapabilities: [createJiraSearchIssuesCapability()],
        runtimeTools: [
          createJiraSearchIssuesTool({
            jiraClient: { searchIssues: () => Effect.succeed([]) },
          }),
        ],
      },
    });

    const manifest = await loadManifest(composition);
    const events = await collectEvents(
      Stream.toAsyncIterable(
        composition.runtime.streamEffect({
          providerId: composition.runtimeProviderId,
          modelId: composition.runtimeModelId,
          requestId: "request_jira_registered",
          assistantTurnId: "turn_jira_registered",
          messages: [{ role: "user", content: "search jira" }],
          availableToolNames: [JIRA_SEARCH_ISSUES_TOOL_NAME],
        }),
      ),
    );

    expect(manifest.tools.map((tool) => tool.name)).toEqual([JIRA_SEARCH_ISSUES_TOOL_NAME]);
    expect(manifest.assistantProfiles[0]?.defaultToolPolicy.allowedToolNames).toEqual([
      JIRA_SEARCH_ISSUES_TOOL_NAME,
    ]);
    expect(events.at(-1)).toMatchObject({ type: "runtime.completed" });
  });

  it("fails closed when a declared tool is selected but no executable is registered", async () => {
    const composition = composePartnerAiService({
      workspace,
      runtime: {
        provider: "fake",
        toolCapabilities: [createJiraSearchIssuesCapability()],
      },
    });

    await expect(
      collectEvents(
        Stream.toAsyncIterable(
          composition.runtime.streamEffect({
            providerId: composition.runtimeProviderId,
            modelId: composition.runtimeModelId,
            requestId: "request_jira_missing_runtime_tool",
            assistantTurnId: "turn_jira_missing_runtime_tool",
            messages: [{ role: "user", content: "search jira" }],
            availableToolNames: [JIRA_SEARCH_ISSUES_TOOL_NAME],
          }),
        ),
      ),
    ).rejects.toThrow(`tool ${JIRA_SEARCH_ISSUES_TOOL_NAME} is not registered`);
  });

  it("declares host commands separately from backend runtime tools", async () => {
    const composition = composePartnerAiService({
      workspace,
      runtime: {
        provider: "fake",
        hostCommands: [
          {
            commandName: "host.open_ticket_panel",
            description: "Ask the host app to open its ticket details panel.",
            inputSchema: { type: "object" },
            approvalMode: "never",
          },
        ],
        approvalPolicies: [
          {
            policyId: "jira_create_issue_requires_approval",
            mode: "always",
            capabilityNames: [JIRA_CREATE_ISSUE_TOOL_NAME],
          },
        ],
        toolCapabilities: [createJiraSearchIssuesCapability(), jiraCreateIssueCapability],
      },
    });

    const manifest = await loadManifest(composition);

    expect(manifest.commands).toEqual([
      expect.objectContaining({
        commandName: "host.open_ticket_panel",
        approvalMode: "never",
      }),
    ]);
    expect(manifest.tools.map((tool) => tool.name)).toEqual([
      JIRA_SEARCH_ISSUES_TOOL_NAME,
      JIRA_CREATE_ISSUE_TOOL_NAME,
    ]);
    expect(manifest.approvalPolicies).toEqual([
      {
        policyId: "jira_create_issue_requires_approval",
        mode: "always",
        capabilityNames: [JIRA_CREATE_ISSUE_TOOL_NAME],
      },
    ]);
  });
});

const loadManifest = (composition: ReturnType<typeof composePartnerAiService>) =>
  Effect.runPromise(
    composition.hostCapabilities.loadManifest({
      authContext,
      workspace,
      hostAppId: composition.hostAppId,
    }),
  );

const collectEvents = async <T>(events: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};

const JIRA_CREATE_ISSUE_TOOL_NAME = "jira.create_issue";

const jiraCreateIssueCapability = {
  name: JIRA_CREATE_ISSUE_TOOL_NAME,
  description: "Create a Jira issue after approval.",
  inputSchema: { type: "object" },
};
