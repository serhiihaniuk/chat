import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type AgentExecutionRequest,
  type AgentExecutor,
  type RuntimeEvent,
} from "@side-chat/agent-runtime";
import {
  CONTEXT_TRUST_LEVELS,
  RESEARCH_CONTEXT_AGENT_ID,
  type MemoryPort,
  type ResearchAgentCapability,
  type ResearchAgentPort,
  type ResearchSourceCandidate,
  type RagRetrieverPort,
  type RetrievalSourceCapability,
} from "@side-chat/partner-ai-core";
import {
  createJiraSearchIssuesCapability,
  createJiraSearchIssuesTool,
  JIRA_SEARCH_ISSUES_TOOL_NAME,
} from "#adapters/tools/examples/jira-search-issues-tool";
import { createNoopResearchAgent } from "#adapters/agents/noop-research-agent";
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

  it("declares research agents separately from runtime execution", async () => {
    const researchAgent: ResearchAgentPort = {
      runResearch: () =>
        Effect.succeed({
          summary: "Research fixture.",
          sources: [] satisfies readonly ResearchSourceCandidate[],
        }),
    };
    const composition = composePartnerAiService({
      workspace,
      researchAgent,
      retrievalSources: [docsSource],
      researchAgents: [researchAgentCapability],
    });

    const manifest = await loadManifest(composition);

    expect(composition.researchAgent).toBe(researchAgent);
    expect(manifest.retrievalSources.map((source) => source.sourceId)).toEqual(["docs"]);
    expect(manifest.researchAgents.map((agent) => agent.researchAgentId)).toEqual([
      RESEARCH_CONTEXT_AGENT_ID,
    ]);
  });

  it("wires configured capability declarations to provided adapters", async () => {
    const memory = createMemoryPort();
    const ragRetriever = createRagRetriever();
    const researchAgent = createNoopResearchAgent();
    const composition = composePartnerAiService({
      workspace,
      capabilities: {
        ...DEFAULT_SERVICE_CAPABILITY_CONFIG,
        memory: {
          mode: "external",
          autoWrite: "disabled",
          defaultScope: "user",
        },
        rag: {
          mode: "external",
          sourceIds: ["docs"],
          failureMode: "fail_turn",
        },
        research: {
          mode: "external",
          failureMode: "fail_turn",
        },
        history: {
          mode: "recent_messages",
          maxMessages: 6,
          maxTokens: 900,
        },
      },
      memory,
      ragRetriever,
      researchAgent,
    });

    const manifest = await loadManifest(composition);

    expect(composition.memory).toBe(memory);
    expect(composition.ragRetriever).toBe(ragRetriever);
    expect(composition.researchAgent).toBe(researchAgent);
    expect(manifest.memoryPolicies).toEqual([
      {
        policyId: "configured_user_memory",
        mode: "read",
        scopes: ["user"],
      },
    ]);
    expect(manifest.retrievalSources.map((source) => source.sourceId)).toEqual(["docs"]);
    expect(manifest.researchAgents.map((agent) => agent.researchAgentId)).toEqual([
      RESEARCH_CONTEXT_AGENT_ID,
    ]);
    expect(composition.capabilities).toMatchObject({
      memory: { state: "configured", policyId: "configured_user_memory" },
      rag: { state: "configured", configuredSourceCount: 1 },
      research: { state: "configured", configuredAgentCount: 1 },
      history: { state: "noop", policyId: "recent_messages" },
      contextAdmission: { state: "noop", policyId: "deterministic_v1" },
    });
  });

  it("rejects concrete capability modes when matching adapters are missing", () => {
    expect(() =>
      composePartnerAiService({
        workspace,
        capabilities: {
          ...DEFAULT_SERVICE_CAPABILITY_CONFIG,
          memory: {
            mode: "external",
            autoWrite: "disabled",
            defaultScope: "user",
          },
        },
      }),
    ).toThrow("SIDECHAT_MEMORY_MODE=external requires a concrete memory adapter.");

    expect(() =>
      composePartnerAiService({
        workspace,
        capabilities: {
          ...DEFAULT_SERVICE_CAPABILITY_CONFIG,
          rag: {
            mode: "external",
            sourceIds: ["docs"],
            failureMode: "fail_turn",
          },
        },
      }),
    ).toThrow("SIDECHAT_RAG_MODE=external requires a concrete RAG retriever.");

    expect(() =>
      composePartnerAiService({
        workspace,
        capabilities: {
          ...DEFAULT_SERVICE_CAPABILITY_CONFIG,
          research: {
            mode: "external",
            failureMode: "fail_turn",
          },
        },
      }),
    ).toThrow("SIDECHAT_RESEARCH_MODE=external requires a concrete research adapter.");
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

const JIRA_CREATE_ISSUE_TOOL_NAME = "jira.create_issue";

const jiraCreateIssueCapability = {
  name: JIRA_CREATE_ISSUE_TOOL_NAME,
  description: "Create a Jira issue after approval.",
  inputSchema: { type: "object" },
};

const docsSource: RetrievalSourceCapability = {
  sourceId: "docs",
  description: "Workspace documentation.",
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
};

const researchAgentCapability: ResearchAgentCapability = {
  researchAgentId: RESEARCH_CONTEXT_AGENT_ID,
  description: "Run pre-answer research.",
};

const createMemoryPort = (): MemoryPort => ({
  recall: () => Effect.succeed([]),
  proposeWriteCandidates: () => Effect.succeed([]),
  writeCandidates: () => Effect.succeed(undefined),
});

const createRagRetriever = (): RagRetrieverPort => ({
  retrieve: () => Effect.succeed([]),
});
