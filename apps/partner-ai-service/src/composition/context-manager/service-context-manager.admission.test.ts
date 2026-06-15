import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import {
  CONTEXT_ADMISSION_DROP_REASONS,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  resolveAssistantProfileFromManifest,
  type ConversationHistoryContextPort,
  type RagContextCandidate,
  type RagRetrieverPort,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createNoopResearchAgent } from "#adapters/agents/noop-research-agent";
import { createNoopMemoryPort } from "#adapters/memory/noop-memory-port";
import { createServiceContextManager } from "./service-context-manager.js";
import { createServiceHostCapabilityManifest } from "../manifest/service-capability-manifest.js";

describe("service context manager budgeted admission", () => {
  it("keeps dropped candidates out of the model-visible context board", async () => {
    const ragRetriever: RagRetrieverPort = {
      retrieve: () => Effect.succeed([createRagCandidate()]),
    };
    const preparedContext = await Effect.runPromise(
      createServiceContextManager({
        historyContext: createHistoryContext(),
        memory: createNoopMemoryPort(),
        ragRetriever,
        researchAgent: createNoopResearchAgent(),
        contextAdmission: {
          policyId: "deterministic_v1",
          maxInputTokens: 12_000,
          reservedOutputTokens: 2_000,
          maxHistoryTokens: 1_500,
          maxMemoryTokens: 900,
          maxRagTokens: 1,
          maxResearchTokens: 1_600,
        },
      }).prepareTurnContext(createContextInput()),
    );

    expect(preparedContext.contextBoard.manifest.entries).toContainEqual(
      expect.objectContaining({
        candidateId: "rag_docs_1",
        included: false,
        dropReason: CONTEXT_ADMISSION_DROP_REASONS.SOURCE_LIMIT_EXCEEDED,
      }),
    );
    expect(preparedContext.contextBoard.sections).not.toContainEqual(
      expect.objectContaining({
        title: "Retrieved context",
        content: expect.stringContaining("Docs say hello."),
      }),
    );
  });
});

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
  requestId: "request_context_admission_001",
  message: { id: "message_context_admission_001", role: "user", content: "find docs" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
    title: "Product dashboard",
  },
} as const;

const createContextInput = () => {
  const manifest = createServiceHostCapabilityManifest({
    runtimeConfig: {},
    providerId: "fake",
    modelId: "fake-echo",
    retrievalSources: [
      {
        sourceId: "docs",
        description: "Product documentation.",
        trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
      },
    ],
  });
  const profileResolution = resolveAssistantProfileFromManifest(manifest);
  if (!profileResolution.resolved) throw new Error(profileResolution.issue.message);

  return {
    authContext,
    workspace: { tenantId: "tenant_local", workspaceId: "workspace_local" },
    conversation: {
      tenantId: "tenant_local",
      workspaceId: "workspace_local",
      conversationId: "conversation_context_admission_001",
    },
    currentUserMessage: {
      tenantId: "tenant_local",
      workspaceId: "workspace_local",
      conversationId: "conversation_context_admission_001",
      messageId: "message_record_context_admission_001",
      sequenceIndex: 2,
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

const createHistoryContext = (): ConversationHistoryContextPort => ({
  readConversationHistory: () => Effect.succeed([]),
});

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
