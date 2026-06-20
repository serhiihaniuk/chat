import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import { type AgentExecutionRequest, type AgentExecutor } from "@side-chat/agent-runtime";
import {
  createJiraSearchIssuesRegistration,
  JIRA_SEARCH_ISSUES_TOOL_NAME,
} from "#adapters/tools/examples/jira-search-issues-tool";
import { MOCK_WEB_SEARCH_TOOL_NAME } from "#adapters/tools/mock-web-search-tool";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
import { createServiceToolRegistration } from "#composition/tools/service-tool-registry";
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
  it("registers a tool once so the manifest capability and runtime executable share one source", async () => {
    const composition = composePartnerAiService({
      workspace,
      runtime: {
        provider: "fake",
        tools: [
          createJiraSearchIssuesRegistration({
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
          providerId: composition.diagnostics.runtimeProviderId,
          modelId: composition.diagnostics.runtimeModelId,
          requestId: "request_jira_registered",
          assistantTurnId: "turn_jira_registered",
          messages: [{ role: "user", content: "jira registry smoke" }],
          toolNames: [JIRA_SEARCH_ISSUES_TOOL_NAME],
          toolScope: runtimeToolScope("turn_jira_registered"),
        }),
      ),
    );

    // Manifest sees the capability, the runtime accepts the selected executable,
    // and diagnostics report the same single registration.
    expect(manifest.tools.map((tool) => tool.name)).toEqual([JIRA_SEARCH_ISSUES_TOOL_NAME]);
    expect(manifest.turnProfiles[0]?.defaultToolPolicy.allowedToolNames).toEqual([
      JIRA_SEARCH_ISSUES_TOOL_NAME,
    ]);
    expect(composition.diagnostics.toolRegistryStatus.tools).toEqual([
      { name: JIRA_SEARCH_ISSUES_TOOL_NAME, defaultEnabled: true, approvalPolicyIds: [] },
    ]);
    expect(events.at(-1)).toMatchObject({ type: "runtime.completed" });
  });

  it("exposes the local mock web search as one complete registration when enabled", async () => {
    const composition = composePartnerAiService({
      workspace,
      runtime: { provider: "fake", enableMockWebSearch: true },
    });

    const manifest = await loadManifest(composition);
    const events = await collectEvents(
      Stream.toAsyncIterable(
        composition.runtime.streamEffect({
          executorId: "ai_sdk.tool_loop",
          providerId: composition.diagnostics.runtimeProviderId,
          modelId: composition.diagnostics.runtimeModelId,
          requestId: "request_mock_web_search",
          assistantTurnId: "turn_mock_web_search",
          messages: [{ role: "user", content: "mock registration smoke" }],
          toolNames: [MOCK_WEB_SEARCH_TOOL_NAME],
          toolScope: runtimeToolScope("turn_mock_web_search"),
        }),
      ),
    );

    // The capability reaches the manifest and the executable reaches the runtime
    // from the same registration: selecting the tool name never fails closed.
    expect(manifest.tools.map((tool) => tool.name)).toEqual([MOCK_WEB_SEARCH_TOOL_NAME]);
    expect(composition.diagnostics.toolRegistryStatus.tools).toEqual([
      { name: MOCK_WEB_SEARCH_TOOL_NAME, defaultEnabled: true, approvalPolicyIds: [] },
    ]);
    expect(events.at(-1)).toMatchObject({ type: "runtime.completed" });
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
          providerId: composition.diagnostics.runtimeProviderId,
          modelId: composition.diagnostics.runtimeModelId,
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

    expect(manifest.turnProfiles).toHaveLength(1);
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

    expect(manifest.turnProfiles[0]).toMatchObject({
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
        tools: [
          createJiraSearchIssuesRegistration({
            jiraClient: { searchIssues: () => Effect.succeed([]) },
          }),
          jiraCreateIssueRegistration,
        ],
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
    composition.ports.hostCapabilities.loadManifest({
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

const jiraCreateIssueRegistration = createServiceToolRegistration({
  capability: {
    name: JIRA_CREATE_ISSUE_TOOL_NAME,
    description: "Create a Jira issue after approval.",
    inputSchema: { type: "object" },
  },
  runtimeTool: {
    name: JIRA_CREATE_ISSUE_TOOL_NAME,
    description: "Create a Jira issue after approval.",
    inputSchema: { type: "object" },
    execute: () => Effect.succeed({ created: true }),
  },
  approvalPolicyIds: ["jira_create_issue_requires_approval"],
});
