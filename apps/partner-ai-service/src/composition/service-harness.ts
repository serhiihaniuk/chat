import {
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
  createTurnPolicyDecision,
  resolveAssistantProfileFromManifest,
  validateHostCapabilityManifest,
  type AssistantProfile,
  type HostCapabilityManifest,
  type HostCapabilityManifestPort,
  type ToolCapability,
  type TurnPolicyResolverPort,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";

import {
  createMockWebSearchTool,
  MOCK_WEB_SEARCH_INPUT_SCHEMA,
  MOCK_WEB_SEARCH_TOOL_NAME,
} from "#adapters/tools/mock-web-search-tool";

const LOCAL_HOST_APP_ID = "side-chat-local";
const DEFAULT_RUNTIME_PROFILE_ID = "default";

export const createServiceHostCapabilityManifest = ({
  runtimeConfig,
  providerId,
  modelId,
}: {
  readonly runtimeConfig: { readonly enableMockWebSearch?: boolean };
  readonly providerId: string;
  readonly modelId: string;
}): HostCapabilityManifest => {
  const tools = runtimeConfig.enableMockWebSearch ? [createMockWebSearchCapability()] : [];
  const profile = createDefaultServiceAssistantProfile({
    providerId,
    modelId,
    allowedToolNames: tools.map((tool) => tool.name),
  });

  return {
    schemaVersion: HOST_CAPABILITY_SCHEMA_VERSIONS.V1,
    hostAppId: LOCAL_HOST_APP_ID,
    defaultAssistantProfileId: profile.profileId,
    assistantProfiles: [profile],
    tools,
    commands: [],
    retrievalSources: [],
    workflows: [],
    approvalPolicies: [],
    memoryPolicies: [profile.memoryPolicy],
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
}: {
  readonly providerId: string;
  readonly modelId: string;
  readonly allowedToolNames: readonly string[];
}): AssistantProfile => ({
  profileId: DEFAULT_RUNTIME_PROFILE_ID,
  version: "2026-06-13",
  displayName: "Default assistant",
  systemPromptId: "runtime_default_profile",
  modelPolicy: { providerId, modelId },
  defaultToolPolicy: {
    mode: allowedToolNames.length > 0 ? "profile_allowlist" : "closed",
    allowedToolNames,
  },
  retrievalPolicy: { mode: "disabled", sourceIds: [] },
  memoryPolicy: { policyId: "no_memory", mode: "disabled", scopes: [] },
  outputContract: { format: "markdown" },
  safetyPolicy: { policyId: "standard", promptInjectionMode: "standard" },
});

const createMockWebSearchCapability = (): ToolCapability => {
  const tool = createMockWebSearchTool({ delayMs: 0 });
  return {
    name: MOCK_WEB_SEARCH_TOOL_NAME,
    description: tool.description,
    inputSchema: MOCK_WEB_SEARCH_INPUT_SCHEMA,
  };
};
