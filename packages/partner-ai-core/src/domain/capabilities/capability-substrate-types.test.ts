import { describe, expect, it } from "vitest";
import {
  CONTEXT_ADMISSION_POLICIES,
  CONTEXT_ADMISSION_SELECTION_MODES,
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  HISTORY_CONTEXT_MODES,
  createTurnPolicyDecision,
  type CapabilityConfig,
  type PreparedTurnContext,
} from "../capabilities-contract.js";
import { createTurnProfile, createManifest } from "#testing/manifest-fixtures";

describe("capability substrate types", () => {
  it("models prepared context without infrastructure types", () => {
    const prepared = {
      contextId: "context_001",
      profile: createTurnProfile(),
      policyDecision: createTurnPolicyDecision({
        manifest: createManifest(),
        profile: createTurnProfile(),
        manifestHash: "sha256:manifest_001",
      }),
      history: {
        policyMode: HISTORY_CONTEXT_MODES.DISABLED,
        consideredMessageCount: 0,
        admittedMessageCount: 0,
        droppedMessageCount: 0,
        estimatedTokens: 0,
        messages: [],
      },
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
            trustLevel: CONTEXT_TRUST_LEVELS.USER_PROVIDED,
            source: CONTEXT_CANDIDATE_SOURCE_TYPES.CURRENT_MESSAGE,
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
          history: {
            policyMode: HISTORY_CONTEXT_MODES.DISABLED,
            consideredMessageCount: 0,
            admittedMessageCount: 0,
            droppedMessageCount: 0,
            estimatedTokens: 0,
            messages: [],
          },
          budget: {
            policyId: CONTEXT_ADMISSION_POLICIES.DETERMINISTIC_V1,
            selectionMode: CONTEXT_ADMISSION_SELECTION_MODES.INCLUDE_ALL,
            maxInputTokens: 4096,
            reservedOutputTokens: 512,
            sourceTokenBudgets: {
              history: 1000,
            },
            includedCandidateIds: ["candidate_001"],
            droppedCandidateIds: [],
          },
          createdAt: "2026-06-13T12:00:00.000Z",
        },
      },
    } satisfies PreparedTurnContext;

    expect(prepared.contextBoard.manifest.entries).toHaveLength(1);
  });

  it("exports capability configuration contracts without service adapter modes", () => {
    const config = {
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
      },
    } satisfies CapabilityConfig;

    expect(config.history.maxMessages).toBe(12);
    expect(config.contextAdmission.maxHistoryTokens).toBe(4_000);
  });
});
