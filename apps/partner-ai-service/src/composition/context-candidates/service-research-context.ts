import {
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  type ContextCandidate,
  type PreparedContextSection,
  type ResearchArtifact,
} from "@side-chat/partner-ai-core";

export const createResearchContextSections = (
  candidates: readonly ContextCandidate[],
  artifacts: readonly ResearchArtifact[],
): readonly PreparedContextSection[] => {
  const researchCandidates = candidates.filter(isResearchCandidate);
  if (researchCandidates.length === 0 && artifacts.length === 0) return [];

  return [
    {
      title: "Research",
      content: [
        ...artifacts.map(renderResearchArtifact),
        ...researchCandidates.map(renderCandidate),
      ]
        .filter((content) => content.length > 0)
        .join("\n\n"),
      priority: 73,
      metadata: {
        artifactIds: artifacts.map((artifact) => artifact.artifactId),
      },
    },
  ];
};

const isResearchCandidate = (candidate: ContextCandidate): boolean =>
  candidate.sourceType === CONTEXT_CANDIDATE_SOURCE_TYPES.RESEARCH_RESULT ||
  candidate.sourceType === CONTEXT_CANDIDATE_SOURCE_TYPES.RESEARCH_ARTIFACT;

const renderResearchArtifact = (artifact: ResearchArtifact): string => {
  const summary = artifact.payload["summary"];
  return typeof summary === "string" ? `Research summary: ${summary}` : "";
};

const renderCandidate = (candidate: ContextCandidate): string =>
  [
    `Source: ${candidate.provenance.label}`,
    candidate.provenance.url ? `URL: ${candidate.provenance.url}` : undefined,
    candidate.content,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
