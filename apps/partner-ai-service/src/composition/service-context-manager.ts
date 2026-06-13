import {
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
  hashCanonicalJson,
  recallAllowedMemoryCandidates,
  retrieveAllowedRagCandidates,
  resolveAssistantProfileFromManifest,
  runAllowedResearchAgent,
  type AssistantProfile,
  type ContextCandidate,
  type ContextManagerPort,
  type HostCapabilityManifest,
  type MemoryPort,
  type MemoryRecord,
  type PreparedContextSection,
  type PreparedTurnContext,
  type RagContextCandidate,
  type RagRetrieverPort,
  type ResearchAgentPort,
  type TurnPolicyDecision,
  type WorkflowArtifact,
} from "@side-chat/partner-ai-core";
import { optionalField } from "@side-chat/shared";
import { Effect } from "effect";
import {
  createHostContextCandidates,
  createHostContextSections,
  type ServiceHostContext,
} from "./service-host-context.js";
import { createMemoryContextSections, toMemoryContextCandidate } from "./service-memory-context.js";
import { createRagContextSections, toRagContextCandidate } from "./service-rag-context.js";
import { createResearchContextSections } from "./service-research-context.js";
import { createAllowedToolSections, createToolContextCandidate } from "./service-tool-context.js";

export type ServiceContextManagerOptions = {
  readonly ragRetriever: RagRetrieverPort;
  readonly memory: MemoryPort;
  readonly researchAgent: ResearchAgentPort;
};

export const createServiceContextManager = ({
  ragRetriever,
  memory,
  researchAgent,
}: ServiceContextManagerOptions): ContextManagerPort => ({
  prepareTurnContext: ({
    authContext,
    workspace,
    conversation,
    request,
    manifest,
    policyDecision,
    now,
    abortSignal,
  }) =>
    Effect.gen(function* () {
      const resolution = resolveAssistantProfileFromManifest(manifest, policyDecision.profileId);
      if (!resolution.resolved) {
        return yield* Effect.fail(
          new PartnerAiCoreError(
            PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
            resolution.issue.message,
            PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
          ),
        );
      }
      const ragCandidates = yield* retrieveAllowedRagCandidates({
        retriever: ragRetriever,
        authContext,
        workspace,
        request,
        policyDecision,
        ...optionalField("abortSignal", abortSignal),
      });
      const memoryRecords = yield* recallAllowedMemoryCandidates({
        memory,
        authContext,
        workspace,
        conversation,
        request,
        policyDecision,
        ...optionalField("abortSignal", abortSignal),
      });
      const researchContext = yield* runAllowedResearchAgent({
        researchAgent,
        authContext,
        workspace,
        request,
        policyDecision,
        now,
        ...optionalField("abortSignal", abortSignal),
      });

      return createPreparedTurnContext({
        requestId: request.requestId,
        messageId: request.message.id,
        messageContent: request.message.content,
        manifest,
        profile: resolution.profile,
        policyDecision,
        memoryRecords,
        ragCandidates,
        researchCandidates: researchContext.candidates,
        workflowArtifacts: researchContext.workflowArtifacts,
        createdAt: now,
        ...optionalField("hostContext", request.hostContext),
      });
    }),
});

const createPreparedTurnContext = ({
  requestId,
  messageId,
  messageContent,
  hostContext,
  manifest,
  profile,
  policyDecision,
  memoryRecords,
  ragCandidates,
  researchCandidates,
  workflowArtifacts,
  createdAt,
}: {
  readonly requestId: string;
  readonly messageId: string;
  readonly messageContent: string;
  readonly hostContext?: ServiceHostContext;
  readonly manifest: HostCapabilityManifest;
  readonly profile: AssistantProfile;
  readonly policyDecision: TurnPolicyDecision;
  readonly memoryRecords: readonly MemoryRecord[];
  readonly ragCandidates: readonly RagContextCandidate[];
  readonly researchCandidates: readonly ContextCandidate[];
  readonly workflowArtifacts: readonly WorkflowArtifact[];
  readonly createdAt: string;
}): PreparedTurnContext => {
  const candidates = createContextCandidates({
    messageId,
    messageContent,
    manifest,
    policyDecision,
    memoryRecords,
    ragCandidates,
    researchCandidates,
    ...optionalField("hostContext", hostContext),
  });
  const sections = createContextSections({
    manifest,
    policyDecision,
    memoryRecords,
    ragCandidates,
    researchCandidates,
    workflowArtifacts,
    ...optionalField("hostContext", hostContext),
  });
  const entries = candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    trustLevel: candidate.trustLevel,
    redactionClass: candidate.redactionClass,
    estimatedTokens: candidate.estimatedTokens,
    included: true,
  }));

  return {
    contextId: `context_${requestId}`,
    profile,
    policyDecision,
    candidates,
    workflowArtifacts,
    runtimeMessages: [{ role: "user", content: messageContent }],
    contextBoard: {
      sections,
      manifest: {
        manifestId: `context_manifest_${requestId}`,
        manifestHash: hashCanonicalJson({
          sections,
          entries,
          profileId: profile.profileId,
          policyDecision,
          workflowArtifacts,
        }),
        profileId: profile.profileId,
        profileVersion: profile.version,
        entries,
        budget: {
          maxInputTokens: 8192,
          reservedOutputTokens: 1024,
          includedCandidateIds: candidates.map((candidate) => candidate.candidateId),
          droppedCandidateIds: [],
        },
        createdAt,
      },
    },
  };
};

const createContextCandidates = ({
  messageId,
  messageContent,
  hostContext,
  manifest,
  policyDecision,
  memoryRecords,
  ragCandidates,
  researchCandidates,
}: {
  readonly messageId: string;
  readonly messageContent: string;
  readonly hostContext?: ServiceHostContext;
  readonly manifest: HostCapabilityManifest;
  readonly policyDecision: TurnPolicyDecision;
  readonly memoryRecords: readonly MemoryRecord[];
  readonly ragCandidates: readonly RagContextCandidate[];
  readonly researchCandidates: readonly ContextCandidate[];
}): readonly ContextCandidate[] => [
  {
    candidateId: `message_${messageId}`,
    sourceType: CONTEXT_CANDIDATE_SOURCE_TYPES.CURRENT_MESSAGE,
    sourceId: messageId,
    trustLevel: CONTEXT_TRUST_LEVELS.USER_PROVIDED,
    redactionClass: CONTEXT_REDACTION_CLASSES.USER_CONFIDENTIAL,
    content: messageContent,
    estimatedTokens: estimateTokens(messageContent),
    priority: 100,
    provenance: { sourceId: messageId, label: "Current user message" },
  },
  ...createHostContextCandidates(hostContext, manifest),
  ...memoryRecords.map(toMemoryContextCandidate),
  ...ragCandidates.map(toRagContextCandidate),
  ...researchCandidates,
  ...policyDecision.allowedToolNames.map((toolName) =>
    createToolContextCandidate(manifest, toolName),
  ),
];

const createContextSections = ({
  hostContext,
  manifest,
  policyDecision,
  memoryRecords,
  ragCandidates,
  researchCandidates,
  workflowArtifacts,
}: {
  readonly hostContext?: ServiceHostContext;
  readonly manifest: HostCapabilityManifest;
  readonly policyDecision: TurnPolicyDecision;
  readonly memoryRecords: readonly MemoryRecord[];
  readonly ragCandidates: readonly RagContextCandidate[];
  readonly researchCandidates: readonly ContextCandidate[];
  readonly workflowArtifacts: readonly WorkflowArtifact[];
}): readonly PreparedContextSection[] => [
  ...createHostContextSections(hostContext),
  ...createMemoryContextSections(memoryRecords),
  ...createRagContextSections(ragCandidates),
  ...createResearchContextSections(researchCandidates, workflowArtifacts),
  ...createAllowedToolSections(manifest, policyDecision.allowedToolNames),
];

const estimateTokens = (content: string): number => Math.max(1, Math.ceil(content.length / 4));
