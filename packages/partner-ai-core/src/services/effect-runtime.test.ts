import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import {
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  type AssistantProfile,
  type HostCapabilityManifest,
} from "#domain/harness";

import { createPartnerAiCoreLayer, partnerAiCoreServicesEffect } from "./effect-runtime.js";

describe("partner AI core Effect runtime layer", () => {
  it("provides typed core services through Effect v4 layers", async () => {
    const layer = createPartnerAiCoreLayer({
      conversations: {
        ensureConversation: () => Effect.fail(new Error("unused")),
        appendUserMessage: () =>
          Effect.succeed({
            tenantId: "tenant-1",
            workspaceId: "workspace-1",
            conversationId: "conversation-1",
            messageId: "message-1",
          }),
      },
      assistantTurns: {
        startAssistantTurn: () =>
          Effect.succeed({
            tenantId: "tenant-1",
            workspaceId: "workspace-1",
            conversationId: "conversation-1",
            assistantTurnId: "turn-1",
            status: "running",
            inserted: true,
          }),
        recordContextSnapshot: () => Effect.succeed(undefined),
        completeAssistantTurn: () => Effect.succeed(undefined),
        failAssistantTurn: () => Effect.succeed(undefined),
      },
      hostCapabilities: {
        loadManifest: () => Effect.succeed(manifest),
      },
      turnPolicies: {
        resolveTurnPolicy: () => Effect.succeed(policyDecision),
      },
      contextManager: {
        prepareTurnContext: () =>
          Effect.succeed({
            contextId: "context-1",
            profile,
            policyDecision,
            candidates: [],
            runtimeMessages: [{ role: "user", content: "hello" }],
            contextBoard: {
              sections: [
                {
                  title: "Current request",
                  content: "hello",
                  priority: 100,
                },
              ],
              manifest: {
                manifestId: "manifest-1",
                manifestHash: "sha256:context",
                profileId: profile.profileId,
                profileVersion: profile.version,
                entries: [
                  {
                    candidateId: "candidate-1",
                    sourceType: "current_message",
                    sourceId: "message-1",
                    trustLevel: CONTEXT_TRUST_LEVELS.USER_PROVIDED,
                    redactionClass: CONTEXT_REDACTION_CLASSES.USER_CONFIDENTIAL,
                    estimatedTokens: 1,
                    included: true,
                  },
                ],
                budget: {
                  maxInputTokens: 4096,
                  reservedOutputTokens: 512,
                  includedCandidateIds: ["candidate-1"],
                  droppedCandidateIds: [],
                },
                createdAt: "2026-05-23T00:00:00.000Z",
              },
            },
          }),
      },
      memory: {
        recall: () => Effect.succeed([]),
        proposeWriteCandidates: () => Effect.succeed([]),
        writeCandidates: () => Effect.succeed(undefined),
      },
      runtime: {
        streamEffect: () => Stream.empty,
      },
      clock: { now: () => "2026-05-23T00:00:00.000Z" },
      ids: {
        nextConversationId: () => "conversation-1",
        nextEventId: () => "event-1",
      },
      policies: { evaluate: () => Effect.succeed({ allowed: true }) },
      turnGuards: { guards: [] },
      observability: { record: () => Effect.succeed(undefined) },
    });

    const services = await Effect.runPromise(Effect.provide(partnerAiCoreServicesEffect, layer));

    expect(services.clock.now()).toBe("2026-05-23T00:00:00.000Z");
    expect(services.ids.nextEventId()).toBe("event-1");
    expect(await Effect.runPromise(services.hostCapabilities.loadManifest(manifestInput))).toBe(
      manifest,
    );
  });
});

const profile: AssistantProfile = {
  profileId: "analyst",
  version: "2026-06-13",
  displayName: "Analyst",
  systemPromptId: "prompt_analyst_v1",
  modelPolicy: { providerId: "fake", modelId: "fake-echo" },
  defaultToolPolicy: { mode: "closed", allowedToolNames: [] },
  retrievalPolicy: { mode: "disabled", sourceIds: [] },
  memoryPolicy: { policyId: "no_memory", mode: "disabled", scopes: [] },
  outputContract: { format: "markdown" },
  safetyPolicy: { policyId: "standard", promptInjectionMode: "standard" },
};

const manifest: HostCapabilityManifest = {
  schemaVersion: HOST_CAPABILITY_SCHEMA_VERSIONS.V1,
  hostAppId: "host-app-1",
  defaultAssistantProfileId: profile.profileId,
  assistantProfiles: [profile],
  tools: [],
  commands: [],
  retrievalSources: [],
  workflows: [],
  approvalPolicies: [],
  memoryPolicies: [profile.memoryPolicy],
  activityRenderers: [],
};

const policyDecision = createTurnPolicyDecision({
  manifest,
  profile,
  manifestHash: hashHostCapabilityManifest(manifest),
});

const manifestInput = {
  authContext: {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    subject: { subjectId: "subject-1", userId: "user-1" },
    actor: { subjectId: "subject-1", userId: "user-1" },
    roles: ["member"],
    scopes: ["conversation:read"],
    source: "test_authority",
    issuedAt: "2026-05-23T00:00:00.000Z",
  },
  workspace: { tenantId: "tenant-1", workspaceId: "workspace-1" },
  hostAppId: "host-app-1",
} as const;
