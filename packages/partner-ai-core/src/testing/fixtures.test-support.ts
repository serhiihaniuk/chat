import { SIDECHAT_PROTOCOL_VERSION, type ChatStreamRequest } from "@side-chat/chat-protocol";
import type { AuthContext } from "#domain/authority";
import {
  CONTEXT_ADMISSION_POLICIES,
  CONTEXT_ADMISSION_SELECTION_MODES,
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  resolveTurnProfileFromManifest,
  type TurnProfile,
  type HostCapabilityManifest,
  type PreparedTurnContext,
  type TurnPolicyDecision,
} from "#domain/capabilities-contract";
import type { StreamChatInput } from "#application/stream-chat/stream-chat-types";

export const authContext: AuthContext = {
  tenantId: "tenant_001",
  workspaceId: "workspace_001",
  subject: { subjectId: "subject_001", userId: "user_001" },
  actor: { subjectId: "subject_001", userId: "user_001" },
  source: "test_authority",
  hostOrigin: "https://host.example",
  issuedAt: "2026-05-23T13:00:00.000Z",
};

export const request: ChatStreamRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_001",
  message: { id: "message_001", content: "hello" },
};

export const input: StreamChatInput = {
  workspace: { tenantId: "tenant_001", workspaceId: "workspace_001" },
  hostAppId: "host_app_001",
  request,
  authContext,
};

export const createManifest = (): HostCapabilityManifest => ({
  schemaVersion: HOST_CAPABILITY_SCHEMA_VERSIONS.V1,
  hostAppId: "host_app_001",
  defaultTurnProfileId: "analyst",
  turnProfiles: [createProfile()],
  tools: [
    {
      name: "mock_web_search",
      description: "Deterministic search capability.",
      inputSchema: { type: "object" },
    },
  ],
  commands: [],
});

export const resolveTestProfile = (manifest: HostCapabilityManifest): TurnProfile => {
  const resolution = resolveTurnProfileFromManifest(manifest, "analyst");
  if (!resolution.resolved) {
    throw new Error(resolution.issue.message);
  }
  return resolution.profile;
};

export const createPreparedContext = (
  profile: TurnProfile,
  policyDecision: TurnPolicyDecision,
): PreparedTurnContext => ({
  contextId: "context_001",
  profile,
  policyDecision,
  candidates: [
    {
      candidateId: "candidate_current_message",
      sourceType: "current_message",
      sourceId: "message_001",
      trustLevel: CONTEXT_TRUST_LEVELS.USER_PROVIDED,
      redactionClass: CONTEXT_REDACTION_CLASSES.USER_CONFIDENTIAL,
      content: "hello",
      estimatedTokens: 1,
      priority: 100,
      provenance: { sourceId: "message_001", label: "Current user message" },
    },
  ],
  runtimeMessages: [{ role: "user", content: "hello" }],
  contextBoard: {
    sections: [
      {
        title: "Current request",
        content: "hello",
        priority: 100,
        trustLevel: CONTEXT_TRUST_LEVELS.USER_PROVIDED,
        source: CONTEXT_CANDIDATE_SOURCE_TYPES.CURRENT_MESSAGE,
      },
    ],
    manifest: {
      manifestId: "context_manifest_001",
      manifestHash: "sha256:context_manifest_001",
      profileId: profile.profileId,
      profileVersion: profile.version,
      entries: [
        {
          candidateId: "candidate_current_message",
          sourceType: "current_message",
          sourceId: "message_001",
          trustLevel: CONTEXT_TRUST_LEVELS.USER_PROVIDED,
          redactionClass: CONTEXT_REDACTION_CLASSES.USER_CONFIDENTIAL,
          estimatedTokens: 1,
          included: true,
        },
      ],
      history: {
        policyMode: "disabled",
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
        includedCandidateIds: ["candidate_current_message"],
        droppedCandidateIds: [],
      },
      createdAt: "2026-05-23T13:00:00.000Z",
    },
  },
  history: {
    policyMode: "disabled",
    consideredMessageCount: 0,
    admittedMessageCount: 0,
    droppedMessageCount: 0,
    estimatedTokens: 0,
    messages: [],
  },
});

const createProfile = (): TurnProfile => ({
  profileId: "analyst",
  version: "2026-06-13",
  displayName: "Analyst",
  systemPromptId: "prompt_analyst_v1",
  systemInstructions: "Use concise analyst language.",
  executorId: "ai_sdk.tool_loop",
  modelPolicy: { providerId: "fake", modelId: "fake-echo" },
  defaultToolPolicy: {
    mode: "profile_allowlist",
    allowedToolNames: ["mock_web_search"],
  },
  outputContract: { format: "markdown" },
  safetyPolicy: { policyId: "standard", promptInjectionMode: "standard", turnGuardIds: [] },
});
