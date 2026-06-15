import {
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type AgentRuntime,
  type AgentRuntimeRequest,
  type RuntimeContextBoard,
  type RuntimeEvent,
} from "@side-chat/agent-runtime";
import { SIDECHAT_PROTOCOL_VERSION, type ChatStreamRequest } from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories } from "@side-chat/db";
import {
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  type MemoryPort,
  type MemoryRecallInput,
  type MemoryRecord,
  type MemoryWriteCandidate,
  type MemoryWriteCandidateProposalInput,
  type MemoryWriteCandidateRecordInput,
  type RagContextCandidate,
  type RagRetrievalInput,
  type RagRetrieverPort,
  type ResearchAgentInput,
  type ResearchAgentPort,
  type ResearchSourceCandidate,
} from "@side-chat/partner-ai-core";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
import { createPartnerAiServiceApp } from "../../app.js";

const validRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_configured_context_001",
  message: {
    id: "message_configured_context_001",
    role: "user",
    content: "hello configured service",
  },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
    title: "Configured service test",
  },
} satisfies ChatStreamRequest;

describe("partner ai service configured capability app path", () => {
  it("sends prepared context to runtime without protocol or database DTOs", async () => {
    const harness = createConfiguredCapabilityHarness();

    const response = await postConfiguredStreamRequest(harness.app);

    expect(response.status).toBe(200);
    await response.text();

    assertRuntimeRequestBoundary(one(harness.runtimeRequests));
    assertConfiguredContextAdaptersRan(harness);
    assertPersistedContextSnapshot(harness.repositories);
    assertConfiguredMemoryWritePath(harness);
  });
});

type ConfiguredCapabilityHarness = {
  readonly app: ReturnType<typeof createPartnerAiServiceApp>;
  readonly repositories: ReturnType<typeof createMemorySidechatRepositories>;
  readonly runtimeRequests: AgentRuntimeRequest[];
  readonly retrievalInputs: RagRetrievalInput[];
  readonly researchInputs: ResearchAgentInput[];
  readonly proposalInputs: MemoryWriteCandidateProposalInput[];
  readonly writeInputs: MemoryWriteCandidateRecordInput[];
};

const createConfiguredCapabilityHarness = (): ConfiguredCapabilityHarness => {
  const repositories = createMemorySidechatRepositories();
  const runtimeRequests: AgentRuntimeRequest[] = [];
  const recallInputs: MemoryRecallInput[] = [];
  const proposalInputs: MemoryWriteCandidateProposalInput[] = [];
  const writeInputs: MemoryWriteCandidateRecordInput[] = [];
  const retrievalInputs: RagRetrievalInput[] = [];
  const researchInputs: ResearchAgentInput[] = [];

  return {
    repositories,
    runtimeRequests,
    retrievalInputs,
    researchInputs,
    proposalInputs,
    writeInputs,
    app: createPartnerAiServiceApp({
      repositories,
      agentRuntime: createRuntimeRequestRecorder(runtimeRequests),
      capabilities: configuredContextCapabilities,
      memory: createMemoryPort({ recallInputs, proposalInputs, writeInputs }),
      ragRetriever: createRagRetriever((input) => {
        retrievalInputs.push(input);
        return Effect.succeed([createRagCandidate()]);
      }),
      researchAgent: createResearchAgent(researchInputs),
    }),
  };
};

const postConfiguredStreamRequest = async (
  app: ReturnType<typeof createPartnerAiServiceApp>,
  request: ChatStreamRequest = validRequest,
): Promise<Response> =>
  app.request("/chat/stream", {
    method: "POST",
    headers: {
      authorization: "Bearer local-test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

const assertRuntimeRequestBoundary = (runtimeRequest: AgentRuntimeRequest) => {
  expect(runtimeRequest).toMatchObject({
    requestId: "request_configured_context_001",
    providerId: "fake",
    modelId: "fake-echo",
    messages: [{ role: "user", content: "hello configured service" }],
  });
  expect(runtimeRequest).not.toHaveProperty("protocolVersion");
  expect(runtimeRequest.messages[0]).not.toHaveProperty("id");
  assertRuntimeContextBoard(runtimeRequest.contextBoard);
};

const assertRuntimeContextBoard = (contextBoard: RuntimeContextBoard | undefined) => {
  expect(contextBoard).toBeTruthy();
  if (!contextBoard) throw new Error("expected runtime context board");

  expect(contextBoard.sections).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: "Memory",
        content: expect.stringContaining("User prefers concise answers."),
      }),
      expect.objectContaining({
        title: "Retrieved context",
        content: expect.stringContaining("Docs say hello configured service."),
      }),
      expect.objectContaining({
        title: "Research",
        content: expect.stringContaining("Configured research summary."),
      }),
    ]),
  );
  expect(contextBoard.manifest?.budget).toMatchObject({
    policyId: "deterministic_v1",
    selectionMode: "include_all",
    maxInputTokens: 6_000,
    reservedOutputTokens: 1_000,
    sourceTokenBudgets: {
      history: 600,
      memory: 500,
      rag: 1_400,
      research: 900,
    },
  });
};

const assertConfiguredContextAdaptersRan = (harness: ConfiguredCapabilityHarness) => {
  expect(harness.retrievalInputs[0]).toMatchObject({ allowedSourceIds: ["docs"] });
  expect(harness.researchInputs[0]).toMatchObject({
    requestId: "request_configured_context_001",
    allowedSourceIds: ["docs"],
  });
};

const assertPersistedContextSnapshot = (
  repositories: ReturnType<typeof createMemorySidechatRepositories>,
) => {
  const snapshotJson = repositories.snapshot().contextSnapshots[0]?.contextRedactedJson;
  expect(snapshotJson).toMatchObject({
    runtimeMessageSummary: {
      messageCount: 1,
      roles: ["user"],
      admittedHistoryMessageIds: [],
    },
    manifest: {
      budget: {
        policyId: "deterministic_v1",
        selectionMode: "include_all",
        maxInputTokens: 6_000,
        reservedOutputTokens: 1_000,
        sourceTokenBudgets: {
          history: 600,
          memory: 500,
          rag: 1_400,
          research: 900,
        },
      },
      entries: expect.arrayContaining([
        expect.objectContaining({
          sourceType: "memory",
          sourceId: "memory_user_configured_1",
          included: true,
        }),
        expect.objectContaining({
          sourceType: "retrieval_result",
          sourceId: "docs",
          included: true,
        }),
        expect.objectContaining({
          sourceType: "research_artifact",
          sourceId: "artifact_configured_research_1",
          included: true,
        }),
        expect.objectContaining({
          sourceType: "research_result",
          sourceId: "docs",
          included: true,
        }),
      ]),
    },
  });
  expect(snapshotJson).not.toHaveProperty("runtimeMessages");
};

const assertConfiguredMemoryWritePath = (harness: ConfiguredCapabilityHarness) => {
  expect(harness.proposalInputs[0]).toMatchObject({
    assistantContent: "Recorded configured context.",
    allowedScopes: ["user"],
  });
  expect(harness.writeInputs[0]?.candidates).toEqual([
    expect.objectContaining({ candidateId: "memory_write_user_configured_1" }),
  ]);
};

const configuredContextCapabilities = {
  ...DEFAULT_SERVICE_CAPABILITY_CONFIG,
  memory: {
    mode: "external",
    autoWrite: "propose_only",
    defaultScope: "user",
  },
  rag: {
    mode: "external",
    sourceIds: ["docs"],
    failureMode: "fail_turn",
  },
  research: {
    mode: "external",
    failureMode: "degrade",
  },
  history: {
    mode: "recent_messages",
    maxMessages: 6,
    maxTokens: 900,
  },
  contextAdmission: {
    policyId: "deterministic_v1",
    maxInputTokens: 6_000,
    reservedOutputTokens: 1_000,
    maxHistoryTokens: 600,
    maxMemoryTokens: 500,
    maxRagTokens: 1_400,
    maxResearchTokens: 900,
  },
} as const;

const createMemoryPort = ({
  recallInputs,
  proposalInputs,
  writeInputs,
}: {
  readonly recallInputs: MemoryRecallInput[];
  readonly proposalInputs: MemoryWriteCandidateProposalInput[];
  readonly writeInputs: MemoryWriteCandidateRecordInput[];
}): MemoryPort => ({
  recall: (input) =>
    Effect.sync(() => {
      recallInputs.push(input);
      return [createMemoryRecord()];
    }),
  proposeWriteCandidates: (input) =>
    Effect.sync(() => {
      proposalInputs.push(input);
      return [createMemoryWriteCandidate(input.assistantTurnId)];
    }),
  writeCandidates: (input) =>
    Effect.sync(() => {
      writeInputs.push(input);
    }),
});

const createMemoryRecord = (): MemoryRecord => ({
  memoryId: "memory_user_configured_1",
  scope: "user",
  content: "User prefers concise answers.",
  confidence: 0.93,
  updatedAt: "2026-05-23T12:00:00.000Z",
});

const createMemoryWriteCandidate = (assistantTurnId: string): MemoryWriteCandidate => ({
  candidateId: "memory_write_user_configured_1",
  scope: "user",
  content: "User greeted the configured service.",
  reason: "Deterministic configured-capability memory candidate.",
  confidence: 0.8,
  sourceTurnId: assistantTurnId,
});

const createRagRetriever = (retrieve: RagRetrieverPort["retrieve"]): RagRetrieverPort => ({
  retrieve,
});

const createRagCandidate = (): RagContextCandidate => ({
  candidateId: "rag_docs_configured_1",
  sourceId: "docs",
  title: "Configured docs result",
  content: "Docs say hello configured service.",
  url: "https://docs.example/configured-service",
  score: 0.91,
  estimatedTokens: 9,
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
  redactionClass: CONTEXT_REDACTION_CLASSES.WORKSPACE_CONFIDENTIAL,
});

const createResearchAgent = (calls: ResearchAgentInput[]): ResearchAgentPort => ({
  runResearch: (input) =>
    Effect.sync(() => {
      calls.push(input);
      return {
        summary: "Configured research summary.",
        artifactId: "artifact_configured_research_1",
        sources: [createResearchSource()],
      };
    }),
});

const createResearchSource = (): ResearchSourceCandidate => ({
  candidateId: "research_docs_configured_1",
  sourceId: "docs",
  title: "Configured research docs",
  content: "Configured research source content.",
  url: "https://docs.example/configured-research",
  score: 0.88,
  estimatedTokens: 8,
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
  redactionClass: CONTEXT_REDACTION_CLASSES.WORKSPACE_CONFIDENTIAL,
});

const createRuntimeRequestRecorder = (calls: AgentRuntimeRequest[]): AgentRuntime => ({
  streamEffect: (request) => {
    calls.push(request);
    return Stream.fromIterable(createRecordedRuntimeEvents(request));
  },
});

const createRecordedRuntimeEvents = (request: AgentRuntimeRequest): readonly RuntimeEvent[] => [
  {
    type: RUNTIME_EVENT_TYPES.STARTED,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 0,
    providerId: request.providerId ?? "fake",
    modelId: request.modelId ?? "fake-echo",
  },
  {
    type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 1,
    content: "Recorded configured context.",
  },
  {
    type: RUNTIME_EVENT_TYPES.COMPLETED,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 2,
    finishReason: RUNTIME_FINISH_REASONS.STOP,
  },
];

const one = <T>(items: readonly T[]): T => {
  expect(items).toHaveLength(1);
  const item = items[0];
  if (!item) throw new Error("expected exactly one item");
  return item;
};
