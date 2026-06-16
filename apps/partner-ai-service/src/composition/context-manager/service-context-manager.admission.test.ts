import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import {
  CONTEXT_ADMISSION_DROP_REASONS,
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  resolveAssistantProfileFromManifest,
  type ConversationHistoryContextPort,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createServiceHostCapabilityManifest } from "../manifest/service-capability-manifest.js";
import { createServiceContextManager } from "./service-context-manager.js";

describe("service context manager budgeted admission", () => {
  it("keeps dropped host candidates out of the model-visible context board", async () => {
    const preparedContext = await Effect.runPromise(
      createServiceContextManager({
        historyContext: createHistoryContext(),
        contextAdmission: {
          policyId: "deterministic_v1",
          maxInputTokens: 2,
          reservedOutputTokens: 0,
          maxHistoryTokens: 1_500,
        },
      }).prepareTurnContext(createContextInput()),
    );

    expect(preparedContext.contextBoard.manifest.entries).toContainEqual(
      expect.objectContaining({
        candidateId: "host_context",
        included: false,
        dropReason: CONTEXT_ADMISSION_DROP_REASONS.BUDGET_EXCEEDED,
      }),
    );
    expect(preparedContext.contextBoard.sections).not.toContainEqual(
      expect.objectContaining({
        title: "Host context",
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
  message: { id: "message_context_admission_001", content: "hi" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
    title: "Product dashboard with a long enough title to exceed the optional budget",
  },
} as const;

const createContextInput = () => {
  const manifest = createServiceHostCapabilityManifest({
    runtimeConfig: {},
    providerId: "fake",
    modelId: "fake-echo",
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
