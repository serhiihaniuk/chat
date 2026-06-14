import { PROTOCOL_ERROR_CODES, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { AuthContext } from "#domain/authority";
import type { TurnPolicyDecision } from "#domain/capabilities";
import type {
  MemoryPort,
  MemoryRecallInput,
  MemoryWriteCandidate,
  MemoryWriteCandidateProposalInput,
  MemoryWriteCandidateRecordInput,
} from "#ports";
import { recallAllowedMemoryCandidates } from "./recall-allowed-memory-candidates.js";
import { recordAllowedMemoryWriteCandidates } from "./record-allowed-memory-write-candidates.js";

describe("memory policy helpers", () => {
  it("skips recall when memory is disabled", async () => {
    const calls: MemoryRecallInput[] = [];
    const records = await Effect.runPromise(
      recallAllowedMemoryCandidates({
        memory: createMemoryPort({ recallCalls: calls }),
        authContext,
        workspace,
        request,
        conversation,
        policyDecision: createPolicyDecision({ mode: "disabled", scopes: [] }),
      }),
    );

    expect(records).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("recalls and defensively filters only allowed memory scopes", async () => {
    const calls: MemoryRecallInput[] = [];
    const records = await Effect.runPromise(
      recallAllowedMemoryCandidates({
        memory: createMemoryPort({ recallCalls: calls }),
        authContext,
        workspace,
        request,
        conversation,
        policyDecision: createPolicyDecision({ mode: "read", scopes: ["user"] }),
        maxCandidates: 1,
      }),
    );

    expect(calls[0]).toMatchObject({
      requestId: "request_memory_001",
      conversationId: "conversation_memory_001",
      userMessage: "remember this",
      allowedScopes: ["user"],
    });
    expect(records).toEqual([
      expect.objectContaining({
        memoryId: "memory_user_1",
        scope: "user",
      }),
    ]);
  });

  it("does not propose write candidates for read-only memory", async () => {
    const proposals: MemoryWriteCandidateProposalInput[] = [];
    const writes: MemoryWriteCandidateRecordInput[] = [];

    const candidates = await Effect.runPromise(
      recordAllowedMemoryWriteCandidates({
        memory: createMemoryPort({ proposalCalls: proposals, writeCalls: writes }),
        authContext,
        workspace,
        request,
        conversation,
        assistantTurnId: "assistant_turn_001",
        policyDecision: createPolicyDecision({ mode: "read", scopes: ["user"] }),
        assistantContent: "The assistant answered.",
      }),
    );

    expect(candidates).toEqual([]);
    expect(proposals).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("records only policy-allowed write candidates for read-write memory", async () => {
    const proposals: MemoryWriteCandidateProposalInput[] = [];
    const writes: MemoryWriteCandidateRecordInput[] = [];

    const candidates = await Effect.runPromise(
      recordAllowedMemoryWriteCandidates({
        memory: createMemoryPort({ proposalCalls: proposals, writeCalls: writes }),
        authContext,
        workspace,
        request,
        conversation,
        assistantTurnId: "assistant_turn_001",
        policyDecision: createPolicyDecision({ mode: "read_write", scopes: ["user"] }),
        assistantContent: "The assistant answered.",
      }),
    );

    expect(proposals[0]).toMatchObject({
      requestId: "request_memory_001",
      conversationId: "conversation_memory_001",
      assistantTurnId: "assistant_turn_001",
      userMessage: "remember this",
      assistantContent: "The assistant answered.",
      allowedScopes: ["user"],
    });
    expect(candidates).toEqual([expect.objectContaining({ candidateId: "write_user_1" })]);
    expect(writes[0]?.candidates).toEqual([
      expect.objectContaining({ candidateId: "write_user_1" }),
    ]);
  });

  it("maps recall failures to a context preparation failure", async () => {
    await expect(
      Effect.runPromise(
        recallAllowedMemoryCandidates({
          memory: {
            ...createMemoryPort({}),
            recall: () => Effect.fail(new Error("memory unavailable")),
          },
          authContext,
          workspace,
          request,
          conversation,
          policyDecision: createPolicyDecision({ mode: "read", scopes: ["user"] }),
        }),
      ),
    ).rejects.toMatchObject({
      protocolCode: PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
      message: "memory unavailable",
    });
  });
});

const createMemoryPort = ({
  recallCalls = [],
  proposalCalls = [],
  writeCalls = [],
}: {
  readonly recallCalls?: MemoryRecallInput[];
  readonly proposalCalls?: MemoryWriteCandidateProposalInput[];
  readonly writeCalls?: MemoryWriteCandidateRecordInput[];
}): MemoryPort => ({
  recall: (input) =>
    Effect.sync(() => {
      recallCalls.push(input);
      return [
        {
          memoryId: "memory_user_1",
          scope: "user",
          content: "User likes terse answers.",
          confidence: 0.9,
          updatedAt: "2026-05-23T12:00:00.000Z",
        },
        {
          memoryId: "memory_workspace_1",
          scope: "workspace",
          content: "Workspace fact that is not allowed.",
          confidence: 0.8,
          updatedAt: "2026-05-23T12:00:00.000Z",
        },
      ];
    }),
  proposeWriteCandidates: (input) =>
    Effect.sync(() => {
      proposalCalls.push(input);
      return [
        createWriteCandidate("write_user_1", "user"),
        createWriteCandidate("write_workspace_1", "workspace"),
      ];
    }),
  writeCandidates: (input) =>
    Effect.sync(() => {
      writeCalls.push(input);
    }),
});

const createWriteCandidate = (candidateId: string, scope: string): MemoryWriteCandidate => ({
  candidateId,
  scope,
  content: `${scope} memory candidate`,
  reason: "Deterministic test extraction.",
  confidence: 0.8,
  sourceTurnId: "assistant_turn_001",
});

const createPolicyDecision = ({
  mode,
  scopes,
}: {
  readonly mode: "disabled" | "read" | "read_write";
  readonly scopes: readonly string[];
}): TurnPolicyDecision => ({
  profileId: "analyst",
  profileVersion: "2026-06-13",
  systemInstructions: "Use concise analyst language.",
  executorId: "ai_sdk.tool_loop",
  providerId: "fake",
  modelId: "fake-echo",
  allowedToolNames: [],
  allowedCommandNames: [],
  retrievalSourceIds: [],
  memoryScope: { mode, scopes },
  workflowPolicy: { mode: "disabled", allowedWorkflowIds: [] },
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
const conversation = {
  tenantId: "tenant_001",
  workspaceId: "workspace_001",
  conversationId: "conversation_memory_001",
};
const request = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_memory_001",
  message: { id: "message_memory_001", role: "user", content: "remember this" },
} as const;
