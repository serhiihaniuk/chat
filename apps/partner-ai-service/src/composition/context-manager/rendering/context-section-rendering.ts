import {
  toContextCandidateId,
  type ContextCandidate,
  type PreparedContextSection,
} from "@side-chat/partner-ai-core";
import { createHostContextSections } from "../../context-candidates/service-host-context.js";
import { createAllowedToolSections } from "../../context-candidates/service-tool-context.js";
import type { PrepareTurnContextInput } from "../service-context-manager-types.js";

export const createPreparedContextSections = (
  input: PrepareTurnContextInput,
  includedCandidates: readonly ContextCandidate[],
): readonly PreparedContextSection[] => [
  ...createAdmittedHostContextSections(input, includedCandidates),
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
