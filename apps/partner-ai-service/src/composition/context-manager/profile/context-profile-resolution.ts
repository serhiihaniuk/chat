import {
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
  resolveTurnProfileFromManifest,
  type TurnProfile,
  type HostCapabilityManifest,
  type TurnPolicyDecision,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";

export const resolveContextProfile = (
  manifest: HostCapabilityManifest,
  policyDecision: TurnPolicyDecision,
): Effect.Effect<TurnProfile, PartnerAiCoreError> => {
  const resolution = resolveTurnProfileFromManifest(manifest, policyDecision.profileId);
  if (resolution.resolved) return Effect.succeed(resolution.profile);

  // At this point policy already selected the profile id. If the manifest no
  // longer contains it, treat that as service configuration failure, not denial.
  return Effect.fail(
    new PartnerAiCoreError(
      PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
      resolution.issue.message,
      PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
    ),
  );
};
