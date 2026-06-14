import { describe, expect, it } from "vitest";
import {
  CAPABILITY_FAILURE_MODES,
  CONTEXT_ADMISSION_POLICIES,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  HISTORY_CONTEXT_MODES,
  MEMORY_AUTO_WRITE_MODES,
  MEMORY_DEFAULT_SCOPES,
  createTurnPolicyDecision,
  type CapabilityConfig,
  type PreparedTurnContext,
  type ResearchArtifact,
} from "../capabilities.js";
import { createAssistantProfile, createManifest } from "#testing/capabilities/manifest-fixtures";

describe("capability substrate types", () => {
  it("models context manifests and research artifacts without infrastructure types", () => {
    const artifact = {
      artifactId: "artifact_research_001",
      researchRunId: "research_context_request_001",
      researchAgentId: "research_context",
      artifactKind: "research_summary",
      contentType: "application/json",
      payload: { summary: "Research found one relevant source." },
      createdAt: "2026-06-13T12:00:00.000Z",
    } satisfies ResearchArtifact;
    const prepared = {
      contextId: "context_001",
      profile: createAssistantProfile(),
      policyDecision: createTurnPolicyDecision({
        manifest: createManifest(),
        profile: createAssistantProfile(),
        manifestHash: "sha256:manifest_001",
      }),
      researchArtifacts: [artifact],
      candidates: [
        {
          candidateId: "candidate_001",
          sourceType: "current_message",
          sourceId: "message_001",
          trustLevel: CONTEXT_TRUST_LEVELS.USER_PROVIDED,
          redactionClass: CONTEXT_REDACTION_CLASSES.USER_CONFIDENTIAL,
          content: "Summarize the attached record.",
          estimatedTokens: 8,
          priority: 100,
          provenance: { sourceId: "message_001", label: "Current user message" },
        },
      ],
      runtimeMessages: [{ role: "user", content: "Summarize the attached record." }],
      contextBoard: {
        sections: [
          {
            title: "Current request",
            content: "Summarize the attached record.",
            priority: 100,
          },
        ],
        manifest: {
          manifestId: "manifest_001",
          manifestHash: "sha256:context_001",
          profileId: "analyst",
          profileVersion: "2026-06-13",
          entries: [
            {
              candidateId: "candidate_001",
              sourceType: "current_message",
              sourceId: "message_001",
              trustLevel: CONTEXT_TRUST_LEVELS.USER_PROVIDED,
              redactionClass: CONTEXT_REDACTION_CLASSES.USER_CONFIDENTIAL,
              estimatedTokens: 8,
              included: true,
            },
          ],
          budget: {
            maxInputTokens: 4096,
            reservedOutputTokens: 512,
            includedCandidateIds: ["candidate_001"],
            droppedCandidateIds: [],
          },
          createdAt: "2026-06-13T12:00:00.000Z",
        },
      },
    } satisfies PreparedTurnContext;

    expect(prepared.contextBoard.manifest.entries).toHaveLength(1);
    expect(prepared.researchArtifacts[0]?.researchAgentId).toBe("research_context");
  });

  it("exports capability configuration contracts without service adapter modes", () => {
    const config = {
      memory: {
        autoWrite: MEMORY_AUTO_WRITE_MODES.PROPOSE_ONLY,
        defaultScope: MEMORY_DEFAULT_SCOPES.USER,
      },
      rag: {
        sourceIds: ["docs"],
        failureMode: CAPABILITY_FAILURE_MODES.DEGRADE,
      },
      research: {
        failureMode: CAPABILITY_FAILURE_MODES.FAIL_TURN,
      },
      history: {
        mode: HISTORY_CONTEXT_MODES.RECENT_MESSAGES,
        maxMessages: 12,
        maxTokens: 4_000,
      },
      contextAdmission: {
        policyId: CONTEXT_ADMISSION_POLICIES.DETERMINISTIC_V1,
        maxInputTokens: 24_000,
        reservedOutputTokens: 4_000,
        maxHistoryTokens: 4_000,
        maxMemoryTokens: 2_000,
        maxRagTokens: 8_000,
        maxResearchTokens: 4_000,
      },
    } satisfies CapabilityConfig;

    expect(config.memory.defaultScope).toBe(MEMORY_DEFAULT_SCOPES.USER);
    expect(config.rag.sourceIds).toEqual(["docs"]);
  });
});
