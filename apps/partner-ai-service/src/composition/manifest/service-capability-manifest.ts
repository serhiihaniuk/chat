import {
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
  createTurnPolicyDecision,
  resolveAssistantProfileFromManifest,
  validateHostCapabilityManifest,
  type AssistantProfile,
  type ApprovalPolicy,
  type HostCommandCapability,
  type HostCapabilityManifest,
  type HostCapabilityManifestPort,
  type ProfileId,
  type ToolCapability,
  type TurnPolicyResolverPort,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";

const LOCAL_HOST_APP_ID = "side-chat-local";

// Declare what this service can offer before core chooses the turn policy.
// The manifest is availability, not permission: validation and policy resolution
// still decide what a single assistant turn may actually use. Assistant profiles
// arrive already built by the assistant profile registry, so this factory never
// composes prompt text or default profiles itself.
export const createServiceHostCapabilityManifest = ({
  assistantProfiles,
  defaultProfileId,
  toolCapabilities = [],
  hostCommands = [],
  approvalPolicies = [],
}: {
  readonly assistantProfiles: readonly AssistantProfile[];
  readonly defaultProfileId: ProfileId;
  readonly toolCapabilities?: readonly ToolCapability[] | undefined;
  readonly hostCommands?: readonly HostCommandCapability[] | undefined;
  readonly approvalPolicies?: readonly ApprovalPolicy[] | undefined;
}): HostCapabilityManifest => ({
  schemaVersion: HOST_CAPABILITY_SCHEMA_VERSIONS.V1,
  hostAppId: LOCAL_HOST_APP_ID,
  defaultAssistantProfileId: defaultProfileId,
  assistantProfiles,
  tools: toolCapabilities,
  commands: hostCommands,
  approvalPolicies,
  activityRenderers: [],
});

export const createStaticHostCapabilityManifestPort = (
  manifest: HostCapabilityManifest,
): HostCapabilityManifestPort => ({
  loadManifest: ({ hostAppId }) => {
    if (hostAppId !== manifest.hostAppId) {
      return Effect.fail(
        new PartnerAiCoreError(
          PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
          `Host capability manifest ${hostAppId} is not registered.`,
          PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.FORBIDDEN,
        ),
      );
    }

    return Effect.succeed(manifest);
  },
});

export const createServiceTurnPolicyResolver = (): TurnPolicyResolverPort => ({
  resolveTurnPolicy: ({ manifest, request, manifestHash }) =>
    Effect.gen(function* () {
      const validation = validateHostCapabilityManifest(manifest);
      if (!validation.valid) {
        return yield* Effect.fail(
          new PartnerAiCoreError(
            PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
            validation.issues.map((issue) => issue.message).join(" "),
            PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
          ),
        );
      }

      const resolution = resolveAssistantProfileFromManifest(manifest, request.assistantProfileId);
      if (!resolution.resolved) {
        return yield* Effect.fail(
          new PartnerAiCoreError(
            PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
            resolution.issue.message,
            PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.FORBIDDEN,
          ),
        );
      }

      return createTurnPolicyDecision({
        manifest,
        profile: resolution.profile,
        manifestHash,
      });
    }),
});
