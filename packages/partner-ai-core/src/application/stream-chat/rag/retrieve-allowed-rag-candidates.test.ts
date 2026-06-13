import { PROTOCOL_ERROR_CODES, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
} from "#domain/harness";
import { PARTNER_AI_CORE_ERROR_CODES } from "#errors";
import type { RagContextCandidate, RagRetrievalInput, RagRetrieverPort } from "#ports";
import {
  authContext,
  createManifest,
  resolveTestProfile,
} from "#testing/stream-chat/fixtures.test-support";
import { retrieveAllowedRagCandidates } from "./retrieve-allowed-rag-candidates.js";

const request = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_rag_001",
  message: { id: "message_rag_001", role: "user", content: "find docs" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
    title: "Product dashboard",
  },
} as const;

const workspace = { tenantId: "tenant_001", workspaceId: "workspace_001" };

describe("retrieveAllowedRagCandidates", () => {
  it("skips retrieval when policy exposes no source ids", async () => {
    let callCount = 0;
    const retriever: RagRetrieverPort = {
      retrieve: () =>
        Effect.sync(() => {
          callCount += 1;
          return [];
        }),
    };

    const candidates = await Effect.runPromise(
      retrieveAllowedRagCandidates({
        retriever,
        authContext,
        workspace,
        request,
        policyDecision: createPolicyDecision([]),
      }),
    );

    expect(candidates).toEqual([]);
    expect(callCount).toBe(0);
  });

  it("passes policy-scoped input and drops candidates outside allowed sources", async () => {
    const inputs: RagRetrievalInput[] = [];
    const abortController = new AbortController();
    const retriever: RagRetrieverPort = {
      retrieve: (input) =>
        Effect.sync(() => {
          inputs.push(input);
          return [
            createRagCandidate("docs", "docs-1"),
            createRagCandidate("admin", "admin-1"),
            createRagCandidate("docs", "docs-2"),
          ];
        }),
    };

    const candidates = await Effect.runPromise(
      retrieveAllowedRagCandidates({
        retriever,
        authContext,
        workspace,
        request,
        policyDecision: createPolicyDecision(["docs"]),
        abortSignal: abortController.signal,
        maxCandidates: 2,
      }),
    );

    expect(inputs[0]).toMatchObject({
      requestId: "request_rag_001",
      userMessage: "find docs",
      allowedSourceIds: ["docs"],
      maxCandidates: 2,
      hostContext: request.hostContext,
    });
    expect(inputs[0]?.abortSignal).toBe(abortController.signal);
    expect(candidates.map((candidate) => candidate.candidateId)).toEqual(["docs-1", "docs-2"]);
  });

  it("maps retriever failures into the core context failure channel", async () => {
    const retriever: RagRetrieverPort = {
      retrieve: () => Effect.fail(new Error("enterprise search unavailable")),
    };

    await expect(
      Effect.runPromise(
        retrieveAllowedRagCandidates({
          retriever,
          authContext,
          workspace,
          request,
          policyDecision: createPolicyDecision(["docs"]),
        }),
      ),
    ).rejects.toMatchObject({
      code: PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
      protocolCode: PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
      message: "enterprise search unavailable",
    });
  });
});

const createPolicyDecision = (retrievalSourceIds: readonly string[]) => {
  const manifest = createManifest();
  const profile = resolveTestProfile(manifest);
  return {
    ...createTurnPolicyDecision({
      manifest,
      profile,
      manifestHash: hashHostCapabilityManifest(manifest),
    }),
    retrievalSourceIds,
  };
};

const createRagCandidate = (sourceId: string, candidateId: string): RagContextCandidate => ({
  candidateId,
  sourceId,
  title: `${sourceId} result`,
  content: `content from ${sourceId}`,
  score: 0.92,
  estimatedTokens: 4,
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
  redactionClass: CONTEXT_REDACTION_CLASSES.WORKSPACE_CONFIDENTIAL,
});
