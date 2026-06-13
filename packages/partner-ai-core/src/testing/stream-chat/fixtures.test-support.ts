import { SIDECHAT_PROTOCOL_VERSION, type ChatStreamRequest } from "@side-chat/chat-protocol";
import type { AuthContext } from "#domain/authority";
import {
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  resolveAssistantProfileFromManifest,
  type AssistantProfile,
  type HostCapabilityManifest,
  type PreparedTurnContext,
  type TurnPolicyDecision,
} from "#domain/harness";
import type { StreamChatInput } from "#application/stream-chat/stream-chat";

export const authContext: AuthContext = {
  tenantId: "tenant_001",
  workspaceId: "workspace_001",
  subject: { subjectId: "subject_001", userId: "user_001" },
  actor: { subjectId: "subject_001", userId: "user_001" },
  roles: ["member"],
  scopes: ["conversation:read", "conversation:write", "message:write"],
  source: "test_authority",
  hostOrigin: "https://host.example",
  issuedAt: "2026-05-23T13:00:00.000Z",
};

export const request: ChatStreamRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_001",
  message: { id: "message_001", role: "user", content: "hello" },
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
  defaultAssistantProfileId: "analyst",
  assistantProfiles: [createProfile()],
  tools: [
    {
      name: "mock_web_search",
      description: "Deterministic search capability.",
      inputSchema: { type: "object" },
    },
  ],
  commands: [],
  retrievalSources: [],
  workflows: [],
  approvalPolicies: [],
  memoryPolicies: [{ policyId: "no_memory", mode: "disabled", scopes: [] }],
  activityRenderers: [],
});

export const resolveTestProfile = (manifest: HostCapabilityManifest): AssistantProfile => {
  const resolution = resolveAssistantProfileFromManifest(manifest, "analyst");
  if (!resolution.resolved) {
    throw new Error(resolution.issue.message);
  }
  return resolution.profile;
};

export const createPreparedContext = (
  profile: AssistantProfile,
  policyDecision: TurnPolicyDecision,
): PreparedTurnContext => ({
  contextId: "context_001",
  profile,
  policyDecision,
  workflowArtifacts: [],
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
      budget: {
        maxInputTokens: 4096,
        reservedOutputTokens: 512,
        includedCandidateIds: ["candidate_current_message"],
        droppedCandidateIds: [],
      },
      createdAt: "2026-05-23T13:00:00.000Z",
    },
  },
});

const createProfile = (): AssistantProfile => ({
  profileId: "analyst",
  version: "2026-06-13",
  displayName: "Analyst",
  systemPromptId: "prompt_analyst_v1",
  modelPolicy: { providerId: "fake", modelId: "fake-echo" },
  defaultToolPolicy: {
    mode: "profile_allowlist",
    allowedToolNames: ["mock_web_search"],
  },
  retrievalPolicy: { mode: "disabled", sourceIds: [] },
  memoryPolicy: { policyId: "no_memory", mode: "disabled", scopes: [] },
  outputContract: { format: "markdown" },
  safetyPolicy: { policyId: "standard", promptInjectionMode: "standard" },
});
