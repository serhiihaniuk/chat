import { PROTOCOL_ERROR_CODES, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { AuthContext } from "#domain/authority";
import {
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  type TurnPolicyDecision,
} from "#domain/harness";
import { PARTNER_AI_CORE_ERROR_CODES } from "#errors";
import type { ResearchAgentInput, ResearchAgentPort, ResearchSourceCandidate } from "#ports";
import {
  RESEARCH_CONTEXT_WORKFLOW_ID,
  runAllowedResearchAgent,
} from "./run-allowed-research-agent.js";

describe("runAllowedResearchAgent", () => {
  it("skips research when source or workflow policy disables it", async () => {
    const calls: ResearchAgentInput[] = [];
    const researchAgent = createResearchAgent(calls);

    const noSources = await Effect.runPromise(
      runAllowedResearchAgent({
        researchAgent,
        authContext,
        workspace,
        request,
        policyDecision: createPolicyDecision({
          retrievalSourceIds: [],
          allowedWorkflowIds: [RESEARCH_CONTEXT_WORKFLOW_ID],
        }),
        now,
      }),
    );
    const noWorkflow = await Effect.runPromise(
      runAllowedResearchAgent({
        researchAgent,
        authContext,
        workspace,
        request,
        policyDecision: createPolicyDecision({
          retrievalSourceIds: ["docs"],
          allowedWorkflowIds: [],
        }),
        now,
      }),
    );

    expect(noSources).toEqual({ candidates: [], workflowArtifacts: [] });
    expect(noWorkflow).toEqual({ candidates: [], workflowArtifacts: [] });
    expect(calls).toEqual([]);
  });

  it("maps research output into context candidates and a workflow artifact", async () => {
    const calls: ResearchAgentInput[] = [];
    const abortController = new AbortController();

    const researchContext = await Effect.runPromise(
      runAllowedResearchAgent({
        researchAgent: createResearchAgent(calls),
        authContext,
        workspace,
        request,
        policyDecision: createPolicyDecision({
          retrievalSourceIds: ["docs"],
          allowedWorkflowIds: [RESEARCH_CONTEXT_WORKFLOW_ID],
        }),
        abortSignal: abortController.signal,
        maxResearchSteps: 2,
        now,
      }),
    );

    expect(calls[0]).toMatchObject({
      requestId: "request_research_001",
      userMessage: "compare sources",
      allowedSourceIds: ["docs"],
      maxResearchSteps: 2,
      hostContext: request.hostContext,
    });
    expect(calls[0]?.abortSignal).toBe(abortController.signal);
    expect(researchContext.workflowArtifacts).toEqual([
      expect.objectContaining({
        artifactId: "artifact_research_001",
        workflowRunId: "research_context_request_research_001",
        artifactKind: "research_summary",
      }),
    ]);
    expect(researchContext.workflowArtifacts[0]?.payload).toMatchObject({
      summary: "Research says docs are relevant.",
      sourceIds: ["docs"],
    });
    expect(researchContext.candidates).toEqual([
      expect.objectContaining({
        candidateId: "research_summary_artifact_research_001",
        sourceType: "workflow_artifact",
        sourceId: "artifact_research_001",
      }),
      expect.objectContaining({
        candidateId: "research_research_docs_1",
        sourceType: "research_result",
        sourceId: "docs",
        provenance: {
          sourceId: "docs",
          label: "Research docs",
          url: "https://docs.example/research",
        },
      }),
    ]);
  });

  it("maps research failures into the core context failure channel", async () => {
    const researchAgent: ResearchAgentPort = {
      runResearch: () => Effect.fail(new Error("research service unavailable")),
    };

    await expect(
      Effect.runPromise(
        runAllowedResearchAgent({
          researchAgent,
          authContext,
          workspace,
          request,
          policyDecision: createPolicyDecision({
            retrievalSourceIds: ["docs"],
            allowedWorkflowIds: [RESEARCH_CONTEXT_WORKFLOW_ID],
          }),
          now,
        }),
      ),
    ).rejects.toMatchObject({
      code: PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
      protocolCode: PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
      message: "research service unavailable",
    });
  });
});

const createResearchAgent = (calls: ResearchAgentInput[]): ResearchAgentPort => ({
  runResearch: (input) =>
    Effect.sync(() => {
      calls.push(input);
      return {
        summary: "Research says docs are relevant.",
        sources: [createResearchSource("docs", "research_docs_1")],
        artifactId: "artifact_research_001",
      };
    }),
});

const createResearchSource = (sourceId: string, candidateId: string): ResearchSourceCandidate => ({
  candidateId,
  sourceId,
  title: "Research docs",
  content: "Research source content.",
  url: "https://docs.example/research",
  score: 0.9,
  estimatedTokens: 6,
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
  redactionClass: CONTEXT_REDACTION_CLASSES.WORKSPACE_CONFIDENTIAL,
});

const createPolicyDecision = ({
  retrievalSourceIds,
  allowedWorkflowIds,
}: {
  readonly retrievalSourceIds: readonly string[];
  readonly allowedWorkflowIds: readonly string[];
}): TurnPolicyDecision => ({
  profileId: "analyst",
  profileVersion: "2026-06-13",
  providerId: "fake",
  modelId: "fake-echo",
  allowedToolNames: [],
  allowedCommandNames: [],
  retrievalSourceIds,
  memoryScope: { mode: "disabled", scopes: [] },
  workflowPolicy: { mode: "manifest_workflows", allowedWorkflowIds },
  approvalRequirements: [],
  manifestHash: "sha256:test",
});

const authContext: AuthContext = {
  tenantId: "tenant_001",
  workspaceId: "workspace_001",
  subject: { subjectId: "subject_001", userId: "user_001" },
  actor: { subjectId: "subject_001", userId: "user_001" },
  roles: ["member"],
  scopes: ["conversation:read"],
  source: "test_authority",
  issuedAt: "2026-05-23T12:00:00.000Z",
};

const workspace = { tenantId: "tenant_001", workspaceId: "workspace_001" };
const request = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_research_001",
  message: { id: "message_research_001", role: "user", content: "compare sources" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
    title: "Research surface",
  },
} as const;
const now = "2026-05-23T13:00:00.000Z";
