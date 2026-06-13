import {
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  type ContextCandidate,
  type HostCapabilityManifest,
  type PreparedContextSection,
} from "@side-chat/partner-ai-core";

export type ServiceHostContext = {
  readonly title?: string;
  readonly url?: string;
  readonly origin?: string;
};

export const createHostContextCandidates = (
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

export const createHostContextSections = (
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

const renderHostContext = (hostContext: ServiceHostContext): string =>
  [
    hostContext.title ? `Title: ${hostContext.title}` : undefined,
    hostContext.url ? `URL: ${hostContext.url}` : undefined,
    hostContext.origin ? `Origin: ${hostContext.origin}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

const estimateTokens = (content: string): number => Math.max(1, Math.ceil(content.length / 4));
