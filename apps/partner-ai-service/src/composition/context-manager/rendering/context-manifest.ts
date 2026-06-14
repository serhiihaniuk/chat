import {
  hashCanonicalJson,
  type AssistantProfile,
  type ContextManifest,
  type PreparedContextSection,
  type TurnPolicyDecision,
  type WorkflowArtifact,
} from "@side-chat/partner-ai-core";
import type { ContextAdmission } from "../candidates/context-candidate-selection.js";

export const createPreparedContextManifest = ({
  requestId,
  profile,
  policyDecision,
  sections,
  workflowArtifacts,
  admission,
  createdAt,
}: {
  readonly requestId: string;
  readonly profile: AssistantProfile;
  readonly policyDecision: TurnPolicyDecision;
  readonly sections: readonly PreparedContextSection[];
  readonly workflowArtifacts: readonly WorkflowArtifact[];
  readonly admission: ContextAdmission;
  readonly createdAt: string;
}): ContextManifest => ({
  manifestId: `context_manifest_${requestId}`,
  manifestHash: hashCanonicalJson({
    sections,
    entries: admission.entries,
    profileId: profile.profileId,
    policyDecision,
    workflowArtifacts,
  }),
  profileId: profile.profileId,
  profileVersion: profile.version,
  entries: admission.entries,
  budget: admission.budget,
  createdAt,
});
