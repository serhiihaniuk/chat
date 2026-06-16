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
  type ToolCapability,
  type TurnPolicyResolverPort,
} from "@side-chat/partner-ai-core";
import { DEFAULT_AGENT_EXECUTOR_ID } from "@side-chat/agent-runtime";
import { Effect } from "effect";

const LOCAL_HOST_APP_ID = "side-chat-local";
const DEFAULT_RUNTIME_PROFILE_ID = "default";
const DEFAULT_RUNTIME_SYSTEM_PROMPT_ID = "runtime_default_profile";
const DEFAULT_RUNTIME_SYSTEM_INSTRUCTIONS =
  "Render final assistant answers as GitHub-flavored Markdown. Use bullet or numbered lists when the answer contains multiple items, preserve emphasis with Markdown syntax, and keep tool payload JSON out of the visible answer unless the user explicitly asks for raw data.";

// Declare what this service can offer before core chooses the turn policy.
// The manifest is availability, not permission: validation and policy resolution
// still decide what a single assistant turn may actually use. Tool capabilities
// and the default allowlist both come from the service tool registry, so a
// declared tool always has a matching executable behind it.
export const createServiceHostCapabilityManifest = ({
  providerId,
  modelId,
  toolCapabilities = [],
  allowedToolNames = [],
  hostCommands = [],
  approvalPolicies = [],
  turnGuardIds = [],
}: {
  readonly providerId: string;
  readonly modelId: string;
  readonly toolCapabilities?: readonly ToolCapability[] | undefined;
  readonly allowedToolNames?: readonly string[] | undefined;
  readonly hostCommands?: readonly HostCommandCapability[] | undefined;
  readonly approvalPolicies?: readonly ApprovalPolicy[] | undefined;
  readonly turnGuardIds?: readonly string[] | undefined;
}): HostCapabilityManifest => {
  const profile = createDefaultServiceAssistantProfile({
    providerId,
    modelId,
    allowedToolNames,
    turnGuardIds,
  });

  return {
    schemaVersion: HOST_CAPABILITY_SCHEMA_VERSIONS.V1,
    hostAppId: LOCAL_HOST_APP_ID,
    defaultAssistantProfileId: profile.profileId,
    assistantProfiles: [profile],
    tools: toolCapabilities,
    commands: hostCommands,
    approvalPolicies,
    activityRenderers: [],
  };
};

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

const createDefaultServiceAssistantProfile = ({
  providerId,
  modelId,
  allowedToolNames,
  turnGuardIds,
}: {
  readonly providerId: string;
  readonly modelId: string;
  readonly allowedToolNames: readonly string[];
  readonly turnGuardIds: readonly string[];
}): AssistantProfile => ({
  profileId: DEFAULT_RUNTIME_PROFILE_ID,
  version: "2026-06-13",
  displayName: "Default assistant",
  systemPromptId: DEFAULT_RUNTIME_SYSTEM_PROMPT_ID,
  systemInstructions: resolveServiceSystemInstructions(DEFAULT_RUNTIME_SYSTEM_PROMPT_ID),
  executorId: DEFAULT_AGENT_EXECUTOR_ID,
  modelPolicy: { providerId, modelId },
  defaultToolPolicy: {
    mode: allowedToolNames.length > 0 ? "profile_allowlist" : "closed",
    allowedToolNames,
  },
  outputContract: { format: "markdown" },
  safetyPolicy: { policyId: "standard", promptInjectionMode: "standard", turnGuardIds },
});

const resolveServiceSystemInstructions = (systemPromptId: string): string => {
  if (systemPromptId === DEFAULT_RUNTIME_SYSTEM_PROMPT_ID) {
    return DEFAULT_RUNTIME_SYSTEM_INSTRUCTIONS;
  }

  throw new Error(`Unknown service system prompt ${systemPromptId}.`);
};
