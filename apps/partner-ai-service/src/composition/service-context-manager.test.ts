import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import {
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  resolveAssistantProfileFromManifest,
  type RagContextCandidate,
  type RagRetrievalInput,
  type RagRetrieverPort,
  type RetrievalSourceCapability,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createNoopRagRetriever } from "#adapters/rag/noop-rag-retriever";
import { createServiceContextManager } from "./service-context-manager.js";
import { createServiceHostCapabilityManifest } from "./service-harness.js";

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
      createServiceContextManager({ ragRetriever }).prepareTurnContext(createContextInput()),
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
        ragRetriever: createNoopRagRetriever(),
      }).prepareTurnContext(createContextInput({ retrievalSources: [] })),
    );

    expect(preparedContext.candidates).not.toContainEqual(
      expect.objectContaining({ sourceType: "retrieval_result" }),
    );
  });
});

const createContextInput = ({
  retrievalSources = [docsSource],
}: {
  readonly retrievalSources?: readonly RetrievalSourceCapability[];
} = {}) => {
  const manifest = createServiceHostCapabilityManifest({
    runtimeConfig: {},
    providerId: "fake",
    modelId: "fake-echo",
    retrievalSources,
  });
  const profileResolution = resolveAssistantProfileFromManifest(manifest);
  if (!profileResolution.resolved) throw new Error(profileResolution.issue.message);

  return {
    authContext,
    workspace: { tenantId: "tenant_local", workspaceId: "workspace_local" },
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
