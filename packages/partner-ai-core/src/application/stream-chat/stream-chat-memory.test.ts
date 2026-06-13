import { SIDECHAT_EVENT_TYPES } from "@side-chat/chat-protocol";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  type AssistantProfile,
  type HostCapabilityManifest,
} from "#domain/harness";
import type {
  MemoryPort,
  MemoryWriteCandidateProposalInput,
  MemoryWriteCandidateRecordInput,
} from "#ports";
import type { ObservabilityRecord, ObservabilitySinkPort } from "#services/observability";
import {
  authContext,
  createManifest,
  input,
  resolveTestProfile,
} from "#testing/stream-chat/fixtures.test-support";
import {
  collect,
  createFakePorts,
  runStreamChat,
} from "#testing/stream-chat/fake-ports.test-support";

describe("stream chat memory lifecycle", () => {
  it("records memory write candidates only after successful read-write turns", async () => {
    const { manifest, policyDecision } = createReadWriteMemoryPlan();
    const proposals: MemoryWriteCandidateProposalInput[] = [];
    const writes: MemoryWriteCandidateRecordInput[] = [];
    const memory: MemoryPort = {
      recall: () => Effect.succeed([]),
      proposeWriteCandidates: (candidateInput) =>
        Effect.sync(() => {
          proposals.push(candidateInput);
          return [
            {
              candidateId: "memory_write_user_1",
              scope: "user",
              content: "User likes concise answers.",
              reason: "The assistant confirmed a stable preference.",
              confidence: 0.84,
              sourceTurnId: candidateInput.assistantTurnId,
            },
          ];
        }),
      writeCandidates: (recordInput) =>
        Effect.sync(() => {
          writes.push(recordInput);
        }),
    };
    const ports = createFakePorts({ authContext, manifest, policyDecision, memory });

    const events = await collect(runStreamChat(input, ports));

    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
    expect(proposals[0]).toMatchObject({
      requestId: "request_001",
      conversationId: "conversation_001",
      assistantTurnId: "assistant_turn_001",
      userMessage: "hello",
      assistantContent: "Fake response",
      allowedScopes: ["user"],
    });
    expect(writes[0]).toMatchObject({
      assistantTurnId: "assistant_turn_001",
      candidates: [expect.objectContaining({ candidateId: "memory_write_user_1" })],
    });
  });

  it("observes memory write candidate failures without changing a completed stream", async () => {
    const { manifest, policyDecision } = createReadWriteMemoryPlan();
    const observations: ObservabilityRecord[] = [];
    const memory: MemoryPort = {
      recall: () => Effect.succeed([]),
      proposeWriteCandidates: () => Effect.fail(new Error("memory extractor unavailable")),
      writeCandidates: () => Effect.fail(new Error("unused")),
    };
    const ports = createFakePorts({
      authContext,
      manifest,
      policyDecision,
      memory,
      observability: createObservabilitySink(observations),
    });

    const events = await collect(runStreamChat(input, ports));

    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
    expect(ports.completedTurns).toHaveLength(1);
    expect(observations).toContainEqual(
      expect.objectContaining({
        lifecycleState: "completed",
        attributes: expect.objectContaining({
          stage: "memory_write_candidates",
          status: "failed",
        }),
      }),
    );
  });
});

const createReadWriteMemoryPlan = (): {
  readonly manifest: HostCapabilityManifest;
  readonly policyDecision: ReturnType<typeof createTurnPolicyDecision>;
} => {
  const baseManifest = createManifest();
  const profile: AssistantProfile = {
    ...resolveTestProfile(baseManifest),
    memoryPolicy: { policyId: "user_memory", mode: "read_write", scopes: ["user"] },
  };
  const manifest: HostCapabilityManifest = {
    ...baseManifest,
    assistantProfiles: [profile],
    memoryPolicies: [profile.memoryPolicy],
  };

  return {
    manifest,
    policyDecision: createTurnPolicyDecision({
      manifest,
      profile,
      manifestHash: hashHostCapabilityManifest(manifest),
    }),
  };
};

const createObservabilitySink = (records: ObservabilityRecord[]): ObservabilitySinkPort => ({
  record: (record) =>
    Effect.sync(() => {
      records.push(record);
    }),
});
