import type { ConversationTitleGenerationPort } from "@side-chat/partner-ai-core";
import { omitUndefinedProperties } from "@side-chat/shared";
import { createMockWebSearchRegistration } from "#adapters/tools/mock-web-search-tool";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import type {
  RuntimeModelMetadata,
  RuntimeToolConfig,
} from "#composition/service-composition-types";
import type { ServiceToolRegistration } from "#composition/tools/service-tool-registry";
import type { ServiceTurnProfileConfig } from "#composition/turn-profile/turn-profile-registry";
import type { PartnerAiServiceOptions } from "#inbound/http/app";
import { AUXILIARY_JOBS } from "../../catalog/capabilities/auxiliary-jobs.js";
import {
  CONFIG_IDS,
  REQUEST_POLICY_MODES,
  SERVICE_PROFILES,
  TOOL_DEFAULT_EXPOSURE,
} from "../../catalog/config-values.js";
import { PROVIDERS } from "../../catalog/providers.js";
import { ServiceConfigError } from "../../service-config-error.js";
import {
  createAuthConfig,
  createPersistenceConfig,
  readRequiredStringEnvReference,
  readServiceProfile,
  readStringEnvReference,
  readWorkspace,
} from "../environment.js";
import type {
  ServiceEnv,
  ServiceProfile,
  SideChatConfig,
  SideChatConfiguredModel,
  SideChatModelDescriptor,
  SideChatToolConfig,
} from "../types.js";
import {
  type ConfigProviderKind,
  readDefaultConfiguredModel,
  readProviderKindForConfig,
  validateSideChatConfig,
} from "../validation.js";

export { readSideChatConfigPort, readSideChatDemoSeedConversations } from "../environment.js";

/**
 * Build deployable service options from the readable Side Chat config.
 *
 * Product behavior comes from `sidechat.config.ts`; env is limited to process
 * wiring, deployment posture, auth tokens, persistence URLs, and provider
 * secrets. This keeps local boot readable while the legacy env parser remains
 * available during the staged migration.
 */
export const createPartnerAiServiceOptionsFromConfig = (
  config: SideChatConfig,
  env: ServiceEnv = process.env,
): PartnerAiServiceOptions => {
  validateSideChatConfig(config);

  const workspace = readWorkspace(config.environment, env);
  const profile = readServiceProfile(readStringEnvReference(env, config.environment.profile));
  const providerKind = readProviderKindForConfig(config);

  return omitUndefinedProperties({
    workspace,
    auth: createAuthConfig(
      profile,
      workspace,
      readStringEnvReference(env, config.environment.authBearerToken),
    ),
    policies: createPolicyConfig(profile, config),
    runtime: createRuntimeConfig(profile, providerKind, config, env),
    capabilities: config.context,
    persistence: createPersistenceConfig(profile, env, config.environment.databaseUrl),
    conversationTitleGeneration: createConversationTitleGeneration(config),
    turnProfiles: [createTurnProfileConfig(providerKind, config)],
    defaultTurnProfileId: config.chat.turnProfile.id,
    turnGuardIds: config.chat.turnProfile.safety.turnGuardIds,
  });
};

const createRuntimeConfig = (
  profile: ServiceProfile,
  providerKind: ConfigProviderKind,
  config: SideChatConfig,
  env: ServiceEnv,
): NonNullable<PartnerAiServiceOptions["runtime"]> => {
  const toolConfig = createRuntimeToolConfig(config);
  const defaultModelId = config.models.default.model.MODEL_ID;

  if (providerKind === PROVIDERS.FAKE.KIND) {
    if (profile === SERVICE_PROFILES.PRODUCTION) {
      throw new ServiceConfigError(
        "Production profile requires sidechat.config.ts to enable OpenAI models.",
      );
    }
    return {
      provider: PROVIDERS.FAKE.KIND,
      modelId: defaultModelId,
      modelMetadata: createRuntimeModelMetadata(config.models.availableModels),
      ...toolConfig,
    };
  }

  const provider = readOpenAIProviderConfig(config);
  const apiKey = readRequiredStringEnvReference(
    env,
    provider.connection.apiKey,
    "when sidechat.config.ts enables OpenAI models",
  );

  const defaultModel = readDefaultConfiguredModel(config);
  return omitUndefinedProperties({
    provider: PROVIDERS.OPENAI.KIND,
    apiKey,
    modelIds: config.models.availableModels.map((entry) => entry.model.MODEL_ID),
    defaultModelId,
    modelMetadata: createRuntimeModelMetadata(config.models.availableModels),
    baseUrl: provider.connection.endpoint
      ? readStringEnvReference(env, provider.connection.endpoint)
      : undefined,
    reasoningEffort: config.models.default.reasoning,
    reasoningEfforts: defaultModel.reasoning.options,
    ...toolConfig,
  });
};

const readOpenAIProviderConfig = (
  config: SideChatConfig,
): Extract<
  SideChatConfig["models"]["provider"],
  { readonly kind: typeof PROVIDERS.OPENAI.KIND }
> => {
  if (config.models.provider.kind === PROVIDERS.OPENAI.KIND) return config.models.provider;

  throw new ServiceConfigError("OpenAI models require an OpenAI provider connection config.");
};

const createRuntimeToolConfig = (
  config: SideChatConfig,
): Pick<RuntimeToolConfig, "tools" | "hostCommands" | "approvalPolicies"> =>
  omitUndefinedProperties({
    tools: createToolRegistrations(config.tools.availableTools),
    hostCommands: nonEmpty(config.hostCommands.availableCommands),
    approvalPolicies: nonEmpty(config.hostCommands.approvalPolicies),
  });

const createToolRegistrations = (
  configuredTools: readonly SideChatToolConfig[],
): readonly ServiceToolRegistration[] | undefined => {
  const registrations = configuredTools.map((toolConfig) =>
    createMockWebSearchRegistration({
      description: toolConfig.modelPrompt.usageInstructions,
      defaultEnabled: toolConfig.exposure.defaultMode === TOOL_DEFAULT_EXPOSURE.ENABLED,
      approvalPolicyIds: toolConfig.exposure.approvalPolicyIds,
      ...omitUndefinedProperties({
        delayMs: toolConfig.parameters.delayMs,
      }),
    }),
  );

  return nonEmpty(registrations);
};

const createPolicyConfig = (
  profile: ServiceProfile,
  config: SideChatConfig,
): ServicePolicyConfig => {
  const mode = config.requestPolicy.mode;
  if (profile === SERVICE_PROFILES.DEVELOPMENT) {
    if (mode === REQUEST_POLICY_MODES.CONFIGURED) {
      throw new ServiceConfigError(
        "Development sidechat.config.ts request policy supports allow_all or fail_closed only.",
      );
    }
    return { profile, mode };
  }

  if (mode === REQUEST_POLICY_MODES.ALLOW_ALL) {
    throw new ServiceConfigError("Production sidechat.config.ts cannot use allow_all policy.");
  }

  return omitUndefinedProperties({
    profile,
    mode,
    allowedModels:
      config.requestPolicy.modelEntitlements.modelIds.length > 0
        ? config.requestPolicy.modelEntitlements.modelIds
        : undefined,
  });
};

const createTurnProfileConfig = (
  providerKind: ConfigProviderKind,
  config: SideChatConfig,
): ServiceTurnProfileConfig => {
  const profile = config.chat.turnProfile;
  return {
    profileId: profile.id,
    version: profile.version,
    displayName: profile.displayName,
    executorId: profile.executor.EXECUTOR_ID,
    prompt: {
      promptId: CONFIG_IDS.SYSTEM_PROMPTS.DEFAULT_TURN_PROFILE,
      sections: [
        {
          id: CONFIG_IDS.PROMPT_SECTIONS.OUTPUT_FORMATTING,
          content: profile.systemInstructions.join("\n"),
        },
      ],
      requiredSectionIds: [CONFIG_IDS.PROMPT_SECTIONS.OUTPUT_FORMATTING],
    },
    model: {
      providerId:
        providerKind === PROVIDERS.FAKE.KIND
          ? PROVIDERS.FAKE.PROVIDER_ID
          : PROVIDERS.OPENAI.PROVIDER_ID,
      modelId: config.models.default.model.MODEL_ID,
      allowedModelIds: config.models.availableModels.map((entry) => entry.model.MODEL_ID),
    },
    outputContract: profile.output,
    toolPolicy: {
      mode: profile.tools.mode,
      allowedToolNames: profile.tools.names,
    },
    safety: {
      policyId: profile.safety.policyId,
      promptInjectionMode: profile.safety.promptInjectionMode,
      turnGuardIds: profile.safety.turnGuardIds,
    },
  };
};

const createConversationTitleGeneration = (
  config: SideChatConfig,
): ConversationTitleGenerationPort => {
  const job = config.auxiliaryModelJobs.availableJobs.find(
    (candidate) => candidate.job.JOB_ID === AUXILIARY_JOBS.CONVERSATION_TITLE.JOB_ID,
  );
  if (!job || job.mode === AUXILIARY_JOBS.CONVERSATION_TITLE.MODES.DISABLED) {
    return { mode: AUXILIARY_JOBS.CONVERSATION_TITLE.MODES.DISABLED };
  }

  return {
    mode: AUXILIARY_JOBS.CONVERSATION_TITLE.MODES.ENABLED,
    prompt: job.prompt,
  };
};

const createRuntimeModelMetadata = (
  models: readonly SideChatConfiguredModel<SideChatModelDescriptor>[],
): readonly RuntimeModelMetadata[] =>
  models.map((entry) =>
    omitUndefinedProperties({
      modelId: entry.model.MODEL_ID,
      displayName: entry.model.DISPLAY_NAME,
      contextWindowTokens: entry.model.CONTEXT_WINDOW_TOKENS,
      maxOutputTokens: entry.model.MAX_OUTPUT_TOKENS,
    }),
  );

const nonEmpty = <Value>(values: readonly Value[]): readonly Value[] | undefined =>
  values.length > 0 ? values : undefined;
