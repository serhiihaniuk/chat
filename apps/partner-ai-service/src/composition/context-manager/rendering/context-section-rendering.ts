import {
  toContextCandidateId,
  type ContextCandidate,
  type PreparedContextSection,
  type ResearchArtifact,
} from "@side-chat/partner-ai-core";
import { createHostContextSections } from "../../context-candidates/service-host-context.js";
import {
  createMemoryContextSections,
  toMemoryContextCandidate,
} from "../../context-candidates/service-memory-context.js";
import { createRagContextSections } from "../../context-candidates/service-rag-context.js";
import { createResearchContextSections } from "../../context-candidates/service-research-context.js";
import { createAllowedToolSections } from "../../context-candidates/service-tool-context.js";
import type {
  GatheredTurnContext,
  PrepareTurnContextInput,
} from "../service-context-manager-types.js";

export const createPreparedContextSections = (
  input: PrepareTurnContextInput,
  gatheredContext: GatheredTurnContext,
  includedCandidates: readonly ContextCandidate[],
  researchArtifacts: readonly ResearchArtifact[],
): readonly PreparedContextSection[] => [
  ...createAdmittedHostContextSections(input, includedCandidates),
  ...createMemoryContextSections(
    gatheredContext.memoryRecords.filter((record) =>
      includesCandidate(includedCandidates, toMemoryContextCandidate(record).candidateId),
    ),
  ),
  ...createRagContextSections(
    gatheredContext.ragCandidates.filter((candidate) =>
      includesCandidate(includedCandidates, candidate.candidateId),
    ),
  ),
  ...createResearchContextSections(
    gatheredContext.researchCandidates.filter((candidate) =>
      includesCandidate(includedCandidates, candidate.candidateId),
    ),
    researchArtifacts,
  ),
  ...createAllowedToolSections(
    input.manifest,
    input.policyDecision.allowedToolNames.filter((toolName) =>
      includesCandidate(includedCandidates, toContextCandidateId(`tool_${toolName}`)),
    ),
  ),
];

const createAdmittedHostContextSections = (
  input: PrepareTurnContextInput,
  includedCandidates: readonly ContextCandidate[],
): readonly PreparedContextSection[] => {
  if (!includesCandidate(includedCandidates, toContextCandidateId("host_context"))) return [];
  return createHostContextSections(input.request.hostContext);
};

const includesCandidate = (
  candidates: readonly ContextCandidate[],
  candidateId: ContextCandidate["candidateId"],
): boolean => candidates.some((candidate) => candidate.candidateId === candidateId);
