import {
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  toContextCandidateId,
  toContextSourceId,
  type ContextCandidate,
  type HostCapabilityManifest,
  type PreparedContextSection,
} from "@side-chat/partner-ai-core";

export const createToolContextCandidate = (
  manifest: HostCapabilityManifest,
  toolName: string,
): ContextCandidate => {
  const content = renderToolCapability(manifest, toolName);
  return {
    candidateId: toContextCandidateId(`tool_${toolName}`),
    sourceType: CONTEXT_CANDIDATE_SOURCE_TYPES.TOOL_CAPABILITY,
    sourceId: toContextSourceId(toolName),
    trustLevel: CONTEXT_TRUST_LEVELS.SYSTEM,
    redactionClass: CONTEXT_REDACTION_CLASSES.PUBLIC,
    content,
    estimatedTokens: estimateTokens(content),
    priority: 70,
    provenance: { sourceId: toContextSourceId(toolName), label: "Allowed runtime tool" },
  };
};

export const createAllowedToolSections = (
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

const renderToolCapability = (manifest: HostCapabilityManifest, toolName: string): string => {
  const tool = manifest.tools.find((candidate) => candidate.name === toolName);
  return tool ? `${tool.name}: ${tool.description}` : `${toolName}: unavailable`;
};

const estimateTokens = (content: string): number => Math.max(1, Math.ceil(content.length / 4));
