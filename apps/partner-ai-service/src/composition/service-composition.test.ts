import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import { type AgentExecutionRequest, type AgentExecutor } from "@side-chat/agent-runtime";
import {
  createJiraSearchIssuesCapability,
  createJiraSearchIssuesTool,
  JIRA_SEARCH_ISSUES_TOOL_NAME,
} from "#adapters/tools/examples/jira-search-issues-tool";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
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
          executorId: "ai_sdk.tool_loop",
          providerId: composition.runtimeProviderId,
          modelId: composition.runtimeModelId,
          requestId: "request_jira_registered",
          assistantTurnId: "turn_jira_registered",
          messages: [{ role: "user", content: "search jira" }],
          toolNames: [JIRA_SEARCH_ISSUES_TOOL_NAME],
          toolScope: runtimeToolScope("turn_jira_registered"),
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
            executorId: "ai_sdk.tool_loop",
            providerId: composition.runtimeProviderId,
            modelId: composition.runtimeModelId,
            requestId: "request_jira_missing_runtime_tool",
            assistantTurnId: "turn_jira_missing_runtime_tool",
            messages: [{ role: "user", content: "search jira" }],
            toolNames: [JIRA_SEARCH_ISSUES_TOOL_NAME],
            toolScope: runtimeToolScope("turn_jira_missing_runtime_tool"),
          }),
        ),
      ),
    ).rejects.toThrow(`tool ${JIRA_SEARCH_ISSUES_TOOL_NAME} is not registered`);
  });

  it("injects app-owned agent executors into the runtime registry", async () => {
    const executionRequests: AgentExecutionRequest[] = [];
    const composition = composePartnerAiService({
      workspace,
      runtime: {
        provider: "fake",
        executors: [createDeterministicExecutor("service.test_executor", executionRequests)],
      },
    });

    const events = await collectEvents(
      Stream.toAsyncIterable(
        composition.runtime.streamEffect({
          executorId: "service.test_executor",
          providerId: composition.runtimeProviderId,
          modelId: composition.runtimeModelId,
          requestId: "request_executor",
          assistantTurnId: "turn_executor",
          messages: [{ role: "user", content: "use fixture executor" }],
          toolNames: [],
          toolScope: runtimeToolScope("turn_executor"),
        }),
      ),
    );

    expect(events.map((event) => event.type)).toEqual([
      RUNTIME_EVENT_TYPES.STARTED,
      RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
      RUNTIME_EVENT_TYPES.COMPLETED,
    ]);
    expect(events[1]).toMatchObject({ content: "executor:service.test_executor" });
    expect(executionRequests).toHaveLength(1);
  });

  it("wires configured history and admission declarations", async () => {
    const composition = composePartnerAiService({
      workspace,
      capabilities: {
        ...DEFAULT_SERVICE_CAPABILITY_CONFIG,
        history: {
          mode: "recent_messages",
          maxMessages: 6,
          maxTokens: 900,
        },
      },
    });

    const manifest = await loadManifest(composition);

    expect(manifest.assistantProfiles).toHaveLength(1);
    expect(composition.capabilities).toMatchObject({
      history: { state: "configured", policyId: "recent_messages" },
      contextAdmission: {
        state: "configured",
        policyId: "deterministic_v1",
        selectionMode: "budgeted",
      },
    });
  });

  it("resolves the service system prompt id to runtime instructions", async () => {
    const composition = composePartnerAiService({ workspace });

    const manifest = await loadManifest(composition);

    expect(manifest.assistantProfiles[0]).toMatchObject({
      systemPromptId: "runtime_default_profile",
      systemInstructions: expect.stringContaining("GitHub-flavored Markdown"),
    });
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

const createDeterministicExecutor = (
  executorId: string,
  calls: AgentExecutionRequest[],
): AgentExecutor => ({
  executorId,
  description: "Deterministic service composition executor.",
  stream: (executionRequest) => {
    calls.push(executionRequest);
    const { requestId, assistantTurnId, providerId, modelId } = executionRequest.providerRequest;
    const events = [
      {
        type: RUNTIME_EVENT_TYPES.STARTED,
        requestId,
        assistantTurnId,
        sequence: 0,
        providerId,
        modelId,
      },
      {
        type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
        requestId,
        assistantTurnId,
        sequence: 1,
        content: `executor:${executorId}`,
      },
      {
        type: RUNTIME_EVENT_TYPES.COMPLETED,
        requestId,
        assistantTurnId,
        sequence: 2,
        finishReason: RUNTIME_FINISH_REASONS.STOP,
      },
    ] satisfies readonly RuntimeEvent[];

    return Stream.fromIterable(events);
  },
});

const runtimeToolScope = (assistantTurnId: string) => ({
  hostAppId: "host_app_001",
  workspaceId: workspace.workspaceId,
  subjectId: authContext.subject.subjectId,
  conversationId: "conversation_001",
  assistantTurnId,
  allowedHostCommandNames: [],
});

const JIRA_CREATE_ISSUE_TOOL_NAME = "jira.create_issue";

const jiraCreateIssueCapability = {
  name: JIRA_CREATE_ISSUE_TOOL_NAME,
  description: "Create a Jira issue after approval.",
  inputSchema: { type: "object" },
};
