import { describe, expect, it } from "vitest";
import {
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  WORKFLOW_RUN_STATUSES,
  createTurnPolicyDecision,
  type PreparedTurnContext,
  type WorkflowNode,
  type WorkflowRun,
} from "../capabilities.js";
import { createAssistantProfile, createManifest } from "#testing/capabilities/manifest-fixtures";

describe("capability substrate types", () => {
  it("models context manifests and workflow ledger records without infrastructure types", () => {
    const prepared = {
      contextId: "context_001",
      profile: createAssistantProfile(),
      policyDecision: createTurnPolicyDecision({
        manifest: createManifest(),
        profile: createAssistantProfile(),
        manifestHash: "sha256:manifest_001",
      }),
      workflowArtifacts: [],
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
    const run = {
      workflowRunId: "workflow_run_001",
      workflowId: "research_then_answer",
      conversationId: "conversation_001",
      status: WORKFLOW_RUN_STATUSES.RUNNING,
      startedAt: "2026-06-13T12:00:00.000Z",
    } satisfies WorkflowRun;
    const node = {
      workflowRunId: run.workflowRunId,
      nodeId: "research",
      profileId: prepared.profile.profileId,
      status: "pending",
      parentNodeIds: [],
    } satisfies WorkflowNode;

    expect(prepared.contextBoard.manifest.entries).toHaveLength(1);
    expect(run.status).toBe(WORKFLOW_RUN_STATUSES.RUNNING);
    expect(node.profileId).toBe("analyst");
  });
});
