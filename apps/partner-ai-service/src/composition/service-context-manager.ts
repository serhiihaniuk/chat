import {
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
  hashCanonicalJson,
  retrieveAllowedRagCandidates,
  resolveAssistantProfileFromManifest,
  type AssistantProfile,
  type ContextCandidate,
  type ContextManagerPort,
  type HostCapabilityManifest,
  type PreparedContextSection,
  type PreparedTurnContext,
  type RagContextCandidate,
  type RagRetrieverPort,
  type TurnPolicyDecision,
} from "@side-chat/partner-ai-core";
import { optionalField } from "@side-chat/shared";
import { Effect } from "effect";
import { createRagContextSections, toRagContextCandidate } from "./service-rag-context.js";

type ServiceHostContext = {
  readonly title?: string;
  readonly url?: string;
  readonly origin?: string;
};

export type ServiceContextManagerOptions = {
  readonly ragRetriever: RagRetrieverPort;
};

export const createServiceContextManager = ({
  ragRetriever,
}: ServiceContextManagerOptions): ContextManagerPort => ({
  prepareTurnContext: ({
    authContext,
    workspace,
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

      return createPreparedTurnContext({
        requestId: request.requestId,
        messageId: request.message.id,
        messageContent: request.message.content,
        manifest,
        profile: resolution.profile,
        policyDecision,
        ragCandidates,
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
  ragCandidates,
  createdAt,
}: {
  readonly requestId: string;
  readonly messageId: string;
  readonly messageContent: string;
  readonly hostContext?: ServiceHostContext;
  readonly manifest: HostCapabilityManifest;
  readonly profile: AssistantProfile;
  readonly policyDecision: TurnPolicyDecision;
  readonly ragCandidates: readonly RagContextCandidate[];
  readonly createdAt: string;
}): PreparedTurnContext => {
  const candidates = createContextCandidates({
    messageId,
    messageContent,
    manifest,
    policyDecision,
    ragCandidates,
    ...optionalField("hostContext", hostContext),
  });
  const sections = createContextSections({
    manifest,
    policyDecision,
    ragCandidates,
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
  ragCandidates,
}: {
  readonly messageId: string;
  readonly messageContent: string;
  readonly hostContext?: ServiceHostContext;
  readonly manifest: HostCapabilityManifest;
  readonly policyDecision: TurnPolicyDecision;
  readonly ragCandidates: readonly RagContextCandidate[];
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
  ...hostContextCandidates(hostContext, manifest),
  ...ragCandidates.map(toRagContextCandidate),
  ...policyDecision.allowedToolNames.map((toolName) => toolCandidate(manifest, toolName)),
];

const hostContextCandidates = (
  hostContext: ServiceHostContext | undefined,
  manifest: HostCapabilityManifest,
): readonly ContextCandidate[] => {
  if (!hostContext) return [];

  const content = renderHostContext(hostContext);
  return [
    {
      candidateId: "host_context",
      sourceType: CONTEXT_CANDIDATE_SOURCE_TYPES.HOST_CONTEXT,
      sourceId: manifest.hostAppId,
      trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
      redactionClass: CONTEXT_REDACTION_CLASSES.WORKSPACE_CONFIDENTIAL,
      content,
      estimatedTokens: estimateTokens(content),
      priority: 80,
      provenance: { sourceId: manifest.hostAppId, label: "Host page context" },
    },
  ];
};

const toolCandidate = (manifest: HostCapabilityManifest, toolName: string): ContextCandidate => {
  const content = renderToolCapability(manifest, toolName);
  return {
    candidateId: `tool_${toolName}`,
    sourceType: CONTEXT_CANDIDATE_SOURCE_TYPES.TOOL_CAPABILITY,
    sourceId: toolName,
    trustLevel: CONTEXT_TRUST_LEVELS.SYSTEM,
    redactionClass: CONTEXT_REDACTION_CLASSES.PUBLIC,
    content,
    estimatedTokens: estimateTokens(content),
    priority: 70,
    provenance: { sourceId: toolName, label: "Allowed runtime tool" },
  };
};

const createContextSections = ({
  hostContext,
  manifest,
  policyDecision,
  ragCandidates,
}: {
  readonly hostContext?: ServiceHostContext;
  readonly manifest: HostCapabilityManifest;
  readonly policyDecision: TurnPolicyDecision;
  readonly ragCandidates: readonly RagContextCandidate[];
}): readonly PreparedContextSection[] => [
  ...hostContextSections(hostContext),
  ...createRagContextSections(ragCandidates),
  ...allowedToolSections(manifest, policyDecision.allowedToolNames),
];

const hostContextSections = (
  hostContext: ServiceHostContext | undefined,
): readonly PreparedContextSection[] =>
  hostContext
    ? [
        {
          title: "Host context",
          content: renderHostContext(hostContext),
          priority: 80,
        },
      ]
    : [];

const allowedToolSections = (
  manifest: HostCapabilityManifest,
  allowedToolNames: readonly string[],
): readonly PreparedContextSection[] =>
  allowedToolNames.length > 0
    ? [
        {
          title: "Allowed tools",
          content: allowedToolNames
            .map((toolName) => renderToolCapability(manifest, toolName))
            .join("\n"),
          priority: 70,
        },
      ]
    : [];

const renderHostContext = (hostContext: ServiceHostContext): string =>
  [
    hostContext.title ? `Title: ${hostContext.title}` : undefined,
    hostContext.url ? `URL: ${hostContext.url}` : undefined,
    hostContext.origin ? `Origin: ${hostContext.origin}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

const renderToolCapability = (manifest: HostCapabilityManifest, toolName: string): string => {
  const tool = manifest.tools.find((candidate) => candidate.name === toolName);
  return tool ? `${tool.name}: ${tool.description}` : `${toolName}: unavailable`;
};

const estimateTokens = (content: string): number => Math.max(1, Math.ceil(content.length / 4));
