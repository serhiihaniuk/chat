import {
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
  createTurnPolicyDecision,
  resolveTurnProfileFromManifest,
  validateHostCapabilityManifest,
  type TurnProfile,
  type ApprovalPolicy,
  type HostCommandCapability,
  type HostCapabilityManifest,
  type HostCapabilityManifestPort,
  type ModelPolicy,
  type ProfileId,
  type ReasoningEffort,
  type ToolCapability,
  type TurnPolicyResolverPort,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import type { ServiceProviderStatus } from "#composition/providers/service-provider-registry";

const LOCAL_HOST_APP_ID = "side-chat-local";

// Declare what this service can offer before core chooses the turn policy.
// The manifest is availability, not permission: validation and policy resolution
// still decide what a single assistant turn may actually use. Turn profiles
// arrive already built by the turn profile registry, so this factory never
// composes prompt text or default profiles itself.
export const createServiceHostCapabilityManifest = ({
  turnProfiles,
  defaultProfileId,
  toolCapabilities = [],
  hostCommands = [],
  approvalPolicies = [],
}: {
  readonly turnProfiles: readonly TurnProfile[];
  readonly defaultProfileId: ProfileId;
  readonly toolCapabilities?: readonly ToolCapability[] | undefined;
  readonly hostCommands?: readonly HostCommandCapability[] | undefined;
  readonly approvalPolicies?: readonly ApprovalPolicy[] | undefined;
}): HostCapabilityManifest => ({
  schemaVersion: HOST_CAPABILITY_SCHEMA_VERSIONS.V1,
  hostAppId: LOCAL_HOST_APP_ID,
  defaultTurnProfileId: defaultProfileId,
  turnProfiles,
  tools: toolCapabilities,
  commands: hostCommands,
  approvalPolicies,
  activityRenderers: [],
});

// A hostAppId that does not match this manifest fails as FORBIDDEN rather than
// reporting "not found", so the port never reveals that the manifest exists.
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

// Turn the host capability manifest plus the request's turnProfileId into a
// TurnPolicyDecision from createTurnPolicyDecision. A structurally invalid manifest
// fails as INTERNAL_ERROR because the service shipped a broken menu, while an
// unresolvable or forbidden profile fails as FORBIDDEN. Those two failure causes
// stay on separate protocol codes so a caller fault is never reported as a service bug.
export const createServiceTurnPolicyResolver = ({
  providers,
}: {
  readonly providers: readonly ServiceProviderStatus[];
}): TurnPolicyResolverPort => ({
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

      const resolution = resolveTurnProfileFromManifest(manifest, request.turnProfileId);
      if (!resolution.resolved) {
        return yield* Effect.fail(
          new PartnerAiCoreError(
            PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
            resolution.issue.message,
            PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.FORBIDDEN,
          ),
        );
      }

      const modelSelection = yield* resolveModelSelection({
        profile: resolution.profile,
        providers,
        requestModel: request.model,
      });

      return createTurnPolicyDecision({
        manifest,
        profile: resolution.profile,
        manifestHash,
        modelSelection,
      });
    }),
});

type RequestedModel = {
  readonly providerId: string;
  readonly modelId: string;
  readonly reasoningEffort?: ReasoningEffort | undefined;
};

type ResolveModelSelectionInput = {
  readonly profile: TurnProfile;
  readonly providers: readonly ServiceProviderStatus[];
  readonly requestModel: RequestedModel | undefined;
};

const resolveModelSelection = ({
  profile,
  providers,
  requestModel,
}: ResolveModelSelectionInput): Effect.Effect<
  ModelPolicy & { readonly reasoning?: { readonly effort: ReasoningEffort } | undefined },
  PartnerAiCoreError
> => {
  const defaultModel = profile.modelPolicy;
  const selection = requestModel ?? {
    providerId: defaultModel.providerId,
    modelId: defaultModel.modelId,
  };
  const provider = providers.find((candidate) => candidate.providerId === selection.providerId);
  if (!provider) return failForbidden(`Provider ${selection.providerId} is not registered.`);
  if (!provider.modelIds.includes(selection.modelId)) {
    return failForbidden(
      `Model ${selection.modelId} is not registered for provider ${provider.providerId}.`,
    );
  }
  if (!isProfileAllowedModel(profile.modelPolicy, selection)) {
    return failForbidden(
      `Model ${selection.modelId} is not allowed for turn profile ${profile.profileId}.`,
    );
  }

  const reasoning = resolveReasoningSelection(provider, selection.reasoningEffort);
  if (reasoning instanceof PartnerAiCoreError) return Effect.fail(reasoning);

  return Effect.succeed({
    providerId: selection.providerId,
    modelId: selection.modelId,
    allowedModelIds: profile.modelPolicy.allowedModelIds,
    reasoning,
  });
};

const isProfileAllowedModel = (modelPolicy: ModelPolicy, selection: RequestedModel): boolean => {
  if (selection.providerId !== modelPolicy.providerId) return false;
  return (modelPolicy.allowedModelIds ?? [modelPolicy.modelId]).includes(selection.modelId);
};

const resolveReasoningSelection = (
  provider: ServiceProviderStatus,
  requestedEffort: ReasoningEffort | undefined,
): { readonly effort: ReasoningEffort } | undefined | PartnerAiCoreError => {
  if (!provider.reasoning)
    return requestedEffort
      ? forbiddenError("Reasoning effort is not configurable for this provider.")
      : undefined;

  const effort = requestedEffort ?? provider.reasoning.effort;
  if (provider.reasoning.allowedEfforts.includes(effort)) return { effort };

  return forbiddenError(
    `Reasoning effort ${effort} is not allowed for provider ${provider.providerId}.`,
  );
};

const failForbidden = (message: string): Effect.Effect<never, PartnerAiCoreError> =>
  Effect.fail(forbiddenError(message));

const forbiddenError = (message: string): PartnerAiCoreError =>
  new PartnerAiCoreError(
    PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
    message,
    PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.FORBIDDEN,
  );
