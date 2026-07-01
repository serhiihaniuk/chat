import {
  hashCanonicalJson,
  toContextCandidateId,
  toContextManifestHash,
  toContextManifestId,
  type ContextCandidate,
  type ContextManifest,
  type HistoryContextManifest,
  type PreparedContextSection,
  type PreparedHistoryMessage,
  type PreparedRuntimeMessage,
  type TurnPolicyDecision,
  type TurnProfile,
} from "@side-chat/partner-ai-core";
import { createHostContextSections } from "../sources/service-host-context.js";
import { createAllowedToolSections } from "../sources/service-tool-context.js";
import type { ContextAdmission } from "../candidates/context-admission.js";
import type { PrepareTurnContextInput } from "../service-context-manager-types.js";

// Render the admitted context board: host/tool context stays in named
// context-board sections, while conversation history becomes runtime messages.
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

export const createPreparedContextManifest = ({
  requestId,
  profile,
  policyDecision,
  sections,
  admission,
  history,
  createdAt,
}: {
  readonly requestId: string;
  readonly profile: TurnProfile;
  readonly policyDecision: TurnPolicyDecision;
  readonly sections: readonly PreparedContextSection[];
  readonly admission: ContextAdmission;
  readonly history: HistoryContextManifest;
  readonly createdAt: string;
}): ContextManifest => ({
  manifestId: toContextManifestId(`context_manifest_${requestId}`),
  manifestHash: toContextManifestHash(
    hashCanonicalJson({
      sections,
      entries: admission.entries,
      history,
      profileId: profile.profileId,
      policyDecision,
    }),
  ),
  profileId: profile.profileId,
  profileVersion: profile.version,
  entries: admission.entries,
  history,
  budget: admission.budget,
  createdAt,
});

// Conversation history and the current user message are rendered as runtime
// messages. Host context travels through the prepared context board instead of
// being rendered as chat-turn messages.
export const createRuntimeMessages = (
  input: PrepareTurnContextInput,
  historyMessages: readonly PreparedHistoryMessage[],
): readonly PreparedRuntimeMessage[] => [
  ...historyMessages.map(toRuntimeMessage),
  { role: "user", content: input.request.message.content },
];

const toRuntimeMessage = (message: PreparedHistoryMessage): PreparedRuntimeMessage => ({
  role: message.role,
  content: message.content,
});
