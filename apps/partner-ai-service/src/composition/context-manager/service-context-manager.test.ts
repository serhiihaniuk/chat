import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import {
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  resolveAssistantProfileFromManifest,
  RESEARCH_CONTEXT_AGENT_ID,
  type MemoryPolicy,
  type MemoryPort,
  type MemoryRecallInput,
  type MemoryRecord,
  type RagContextCandidate,
  type RagRetrievalInput,
  type RagRetrieverPort,
  type ResearchAgentInput,
  type ResearchAgentCapability,
  type ResearchAgentPort,
  type ResearchSourceCandidate,
  type RetrievalSourceCapability,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createNoopResearchAgent } from "#adapters/agents/noop-research-agent";
import { createNoopMemoryPort } from "#adapters/memory/noop-memory-port";
import { createNoopRagRetriever } from "#adapters/rag/noop-rag-retriever";
import { createServiceContextManager } from "./service-context-manager.js";
import { createServiceHostCapabilityManifest } from "../manifest/service-capability-manifest.js";

const authContext = {
  tenantId: "tenant_local",
  workspaceId: "workspace_local",
  subject: { subjectId: "subject_1", userId: "user_1" },
  actor: { subjectId: "subject_1", userId: "user_1" },
  roles: ["member"],
  scopes: ["conversation:read", "conversation:write", "message:write"],
  source: "test_authority",
  issuedAt: "2026-05-23T13:00:00.000Z",
} as const;

const request = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_context_rag_001",
  message: { id: "message_context_rag_001", role: "user", content: "find docs" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
    title: "Product dashboard",
  },
} as const;

describe("service context manager RAG", () => {
  it("adds retrieved candidates and source sections when policy allows RAG", async () => {
    const retrievalInputs: RagRetrievalInput[] = [];
    const ragRetriever: RagRetrieverPort = {
      retrieve: (input) =>
        Effect.sync(() => {
          retrievalInputs.push(input);
          return [createRagCandidate()];
        }),
    };

    const preparedContext = await Effect.runPromise(
      createServiceContextManager({
        memory: createNoopMemoryPort(),
        ragRetriever,
        researchAgent: createNoopResearchAgent(),
      }).prepareTurnContext(createContextInput()),
    );

    expect(retrievalInputs[0]).toMatchObject({
      requestId: "request_context_rag_001",
      userMessage: "find docs",
      allowedSourceIds: ["docs"],
    });
    expect(preparedContext.candidates).toContainEqual(
      expect.objectContaining({
        candidateId: "rag_docs_1",
        sourceType: "retrieval_result",
        sourceId: "docs",
        provenance: {
          sourceId: "docs",
          label: "Docs result",
          url: "https://docs.example/rag",
        },
      }),
    );
    expect(preparedContext.contextBoard.sections).toContainEqual(
      expect.objectContaining({
        title: "Retrieved context",
        content: expect.stringContaining("Docs say hello."),
      }),
    );
    expect(preparedContext.contextBoard.manifest.entries).toContainEqual(
      expect.objectContaining({
        candidateId: "rag_docs_1",
        sourceType: "retrieval_result",
        included: true,
      }),
    );
  });

  it("does not call retrieval when the resolved policy disables RAG", async () => {
    const preparedContext = await Effect.runPromise(
      createServiceContextManager({
        memory: createNoopMemoryPort(),
        ragRetriever: createNoopRagRetriever(),
        researchAgent: createNoopResearchAgent(),
      }).prepareTurnContext(createContextInput({ retrievalSources: [] })),
    );

    expect(preparedContext.candidates).not.toContainEqual(
      expect.objectContaining({ sourceType: "retrieval_result" }),
    );
  });
});

describe("service context manager context admission", () => {
  it("records configured token budgets in the prepared context manifest", async () => {
    const preparedContext = await Effect.runPromise(
      createServiceContextManager({
        memory: createNoopMemoryPort(),
        ragRetriever: createNoopRagRetriever(),
        researchAgent: createNoopResearchAgent(),
        contextAdmission: {
          policyId: "deterministic_v1",
          maxInputTokens: 12_000,
          reservedOutputTokens: 2_000,
          maxHistoryTokens: 1_500,
          maxMemoryTokens: 900,
          maxRagTokens: 4_000,
          maxResearchTokens: 1_600,
        },
      }).prepareTurnContext(createContextInput({ retrievalSources: [] })),
    );

    expect(preparedContext.contextBoard.manifest.budget).toMatchObject({
      policyId: "deterministic_v1",
      selectionMode: "include_all",
      maxInputTokens: 12_000,
      reservedOutputTokens: 2_000,
      sourceTokenBudgets: {
        history: 1_500,
        memory: 900,
        rag: 4_000,
        research: 1_600,
      },
    });
  });
});

describe("service context manager memory", () => {
  it("adds recalled memory candidates and sections when policy allows recall", async () => {
    const recallInputs: MemoryRecallInput[] = [];
    const memory: MemoryPort = {
      recall: (input) =>
        Effect.sync(() => {
          recallInputs.push(input);
          return [createMemoryRecord()];
        }),
      proposeWriteCandidates: () => Effect.succeed([]),
      writeCandidates: () => Effect.succeed(undefined),
    };

    const preparedContext = await Effect.runPromise(
      createServiceContextManager({
        memory,
        ragRetriever: createNoopRagRetriever(),
        researchAgent: createNoopResearchAgent(),
      }).prepareTurnContext(
        createContextInput({
          memoryPolicy: { policyId: "user_memory", mode: "read", scopes: ["user"] },
          retrievalSources: [],
        }),
      ),
    );

    expect(recallInputs[0]).toMatchObject({
      requestId: "request_context_rag_001",
      conversationId: "conversation_context_001",
      userMessage: "find docs",
      allowedScopes: ["user"],
    });
    expect(preparedContext.candidates).toContainEqual(
      expect.objectContaining({
        candidateId: "memory_memory_user_1",
        sourceType: "memory",
        sourceId: "memory_user_1",
        provenance: {
          sourceId: "memory_user_1",
          label: "user memory",
        },
      }),
    );
    expect(preparedContext.contextBoard.sections).toContainEqual(
      expect.objectContaining({
        title: "Memory",
        content: expect.stringContaining("Prefers concise answers."),
      }),
    );
  });
});

describe("service context manager research", () => {
  it("adds research candidates, artifacts, sections, and manifest entries when policy allows it", async () => {
    const researchInputs: ResearchAgentInput[] = [];
    const researchAgent = createResearchAgent(researchInputs);

    const preparedContext = await Effect.runPromise(
      createServiceContextManager({
        memory: createNoopMemoryPort(),
        ragRetriever: createNoopRagRetriever(),
        researchAgent,
      }).prepareTurnContext(createContextInput({ researchAgents: [researchAgentCapability] })),
    );

    expect(researchInputs[0]).toMatchObject({
      requestId: "request_context_rag_001",
      userMessage: "find docs",
      allowedSourceIds: ["docs"],
      maxResearchSteps: 4,
    });
    expect(preparedContext.researchArtifacts).toEqual([
      expect.objectContaining({
        artifactId: "artifact_research_context_001",
        researchRunId: "research_context_request_context_rag_001",
        researchAgentId: RESEARCH_CONTEXT_AGENT_ID,
        artifactKind: "research_summary",
      }),
    ]);
    expect(preparedContext.candidates).toContainEqual(
      expect.objectContaining({
        candidateId: "research_summary_artifact_research_context_001",
        sourceType: "research_artifact",
        sourceId: "artifact_research_context_001",
      }),
    );
    expect(preparedContext.candidates).toContainEqual(
      expect.objectContaining({
        candidateId: "research_research_docs_1",
        sourceType: "research_result",
        sourceId: "docs",
      }),
    );
    expect(preparedContext.contextBoard.sections).toContainEqual(
      expect.objectContaining({
        title: "Research",
        content: expect.stringContaining("Research summary"),
      }),
    );
    expect(preparedContext.contextBoard.sections).toContainEqual(
      expect.objectContaining({
        title: "Research",
        content: expect.stringContaining("Research source content."),
      }),
    );
    expect(preparedContext.contextBoard.manifest.entries).toContainEqual(
      expect.objectContaining({
        candidateId: "research_research_docs_1",
        sourceType: "research_result",
        included: true,
      }),
    );
  });

  it("does not call research when source or research policy disables it", async () => {
    const researchInputs: ResearchAgentInput[] = [];
    const researchAgent = createResearchAgent(researchInputs);

    const noSources = await Effect.runPromise(
      createServiceContextManager({
        memory: createNoopMemoryPort(),
        ragRetriever: createNoopRagRetriever(),
        researchAgent,
      }).prepareTurnContext(
        createContextInput({
          retrievalSources: [],
          researchAgents: [researchAgentCapability],
        }),
      ),
    );
    const noResearchAgent = await Effect.runPromise(
      createServiceContextManager({
        memory: createNoopMemoryPort(),
        ragRetriever: createNoopRagRetriever(),
        researchAgent,
      }).prepareTurnContext(createContextInput({ researchAgents: [] })),
    );

    expect(researchInputs).toEqual([]);
    expect(noSources.candidates).not.toContainEqual(
      expect.objectContaining({ sourceType: "research_result" }),
    );
    expect(noResearchAgent.candidates).not.toContainEqual(
      expect.objectContaining({ sourceType: "research_result" }),
    );
    expect(noSources.researchArtifacts).toEqual([]);
    expect(noResearchAgent.researchArtifacts).toEqual([]);
  });
});

const createContextInput = ({
  retrievalSources = [docsSource],
  researchAgents = [],
  memoryPolicy = { policyId: "no_memory", mode: "disabled", scopes: [] },
}: {
  readonly retrievalSources?: readonly RetrievalSourceCapability[];
  readonly researchAgents?: readonly ResearchAgentCapability[];
  readonly memoryPolicy?: MemoryPolicy;
} = {}) => {
  const manifest = createServiceHostCapabilityManifest({
    runtimeConfig: {},
    providerId: "fake",
    modelId: "fake-echo",
    retrievalSources,
    researchAgents,
    memoryPolicy,
  });
  const profileResolution = resolveAssistantProfileFromManifest(manifest);
  if (!profileResolution.resolved) throw new Error(profileResolution.issue.message);

  return {
    authContext,
    workspace: { tenantId: "tenant_local", workspaceId: "workspace_local" },
    conversation: {
      tenantId: "tenant_local",
      workspaceId: "workspace_local",
      conversationId: "conversation_context_001",
    },
    request,
    manifest,
    policyDecision: createTurnPolicyDecision({
      manifest,
      profile: profileResolution.profile,
      manifestHash: hashHostCapabilityManifest(manifest),
    }),
    now: "2026-05-23T13:00:00.000Z",
  };
};

const docsSource: RetrievalSourceCapability = {
  sourceId: "docs",
  description: "Product documentation.",
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
};

const createRagCandidate = (): RagContextCandidate => ({
  candidateId: "rag_docs_1",
  sourceId: "docs",
  title: "Docs result",
  content: "Docs say hello.",
  url: "https://docs.example/rag",
  score: 0.88,
  estimatedTokens: 8,
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
  redactionClass: CONTEXT_REDACTION_CLASSES.WORKSPACE_CONFIDENTIAL,
});

const createMemoryRecord = (): MemoryRecord => ({
  memoryId: "memory_user_1",
  scope: "user",
  content: "Prefers concise answers.",
  confidence: 0.92,
  updatedAt: "2026-05-23T12:00:00.000Z",
});

const createResearchAgent = (calls: ResearchAgentInput[]): ResearchAgentPort => ({
  runResearch: (input) =>
    Effect.sync(() => {
      calls.push(input);
      return {
        summary: "Research summary says docs are relevant.",
        sources: [createResearchSource()],
        artifactId: "artifact_research_context_001",
      };
    }),
});

const createResearchSource = (): ResearchSourceCandidate => ({
  candidateId: "research_docs_1",
  sourceId: "docs",
  title: "Research docs",
  content: "Research source content.",
  url: "https://docs.example/research",
  score: 0.9,
  estimatedTokens: 6,
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
  redactionClass: CONTEXT_REDACTION_CLASSES.WORKSPACE_CONFIDENTIAL,
});

const researchAgentCapability: ResearchAgentCapability = {
  researchAgentId: RESEARCH_CONTEXT_AGENT_ID,
  description: "Run pre-answer research.",
};
