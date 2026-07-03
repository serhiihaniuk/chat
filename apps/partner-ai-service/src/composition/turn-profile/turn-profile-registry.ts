import type {
  CallSettingsPolicy,
  TurnProfile,
  ModelPolicy,
  OutputContract,
  ProfileId,
  SafetyPolicy,
  ToolExposurePolicy,
} from "@side-chat/partner-ai-core";
import type {
  BuiltSystemPrompt,
  SystemPromptBuilder,
  SystemPromptDefinition,
} from "./prompt/system-prompt-builder.js";
import { DEFAULT_OUTPUT_CONTRACT, TOOL_POLICY_MODES } from "#config/catalog/config-values";
import { EXECUTORS } from "#config/catalog/capabilities/executors";

/**
 * Service-owned turn profile declaration consumed by the registry.
 *
 * This is the source config for one manifest profile. Fields reuse the core
 * `TurnProfile` policy shapes so service config and the published manifest
 * cannot drift; the prompt remains a definition until the registry builds
 * literal `systemInstructions`.
 */
export type ServiceTurnProfileConfig = {
  readonly profileId: string;
  readonly version: string;
  readonly displayName: string;
  readonly prompt: SystemPromptDefinition;
  readonly executorId?: string | undefined;
  readonly model: ModelPolicy;
  readonly callSettings?: CallSettingsPolicy | undefined;
  readonly toolPolicy: ToolExposurePolicy;
  readonly outputContract?: OutputContract | undefined;
  readonly safety: SafetyPolicy;
};

/**
 * Service-side turn profile representation used by core policy.
 *
 * Registry output keeps the manifest target and prompt build result together.
 * `profile` is the core `TurnProfile` the manifest publishes; `prompt` keeps
 * the built prompt id, content, section ids, and hash so the service can explain
 * where `systemInstructions` came from.
 */
export type ServiceTurnProfile = {
  readonly profile: TurnProfile;
  readonly prompt: BuiltSystemPrompt;
};

export type TurnProfileRegistryProvider = {
  readonly providerId: string;
  readonly modelIds: readonly string[];
};

export type TurnProfileRegistryInput = {
  readonly turnProfiles: readonly ServiceTurnProfileConfig[];
  readonly defaultProfileId: string;
  readonly promptBuilder: SystemPromptBuilder;
  readonly providers: readonly TurnProfileRegistryProvider[];
  readonly toolNames: readonly string[];
  readonly guardIds: readonly string[];
};

export type TurnProfileRegistry = {
  readonly turnProfiles: readonly TurnProfile[];
  readonly serviceProfiles: readonly ServiceTurnProfile[];
  readonly defaultProfileId: ProfileId;
};

/** Composition-time failure raised when turn profile config is invalid. */
export class TurnProfileRegistryError extends Error {
  readonly code = "service_turn_profile_registry_invalid";

  constructor(message: string) {
    super(message);
    this.name = "TurnProfileRegistryError";
  }
}

/**
 * Validate turn profile configs and build manifest profiles from one path.
 *
 * Validation fails closed before any route serves traffic: the default profile
 * must exist, profile ids must be unique, and every model, tool name, guard id,
 * and tool policy shape must match the provider/tool/guard registries.
 */
export const createTurnProfileRegistry = (input: TurnProfileRegistryInput): TurnProfileRegistry => {
  if (input.turnProfiles.length === 0) {
    throw new TurnProfileRegistryError(
      "Turn profile registry requires at least one turn profile config.",
    );
  }

  assertUniqueProfileIds(input.turnProfiles);
  assertDefaultProfilePresent(input);

  const serviceProfiles = input.turnProfiles.map((turnProfileConfig) =>
    buildServiceProfile(turnProfileConfig, input),
  );
  const defaultProfile = serviceProfiles.find(
    (serviceProfile) => serviceProfile.profile.profileId === input.defaultProfileId,
  ) as ServiceTurnProfile;

  return {
    turnProfiles: serviceProfiles.map((serviceProfile) => serviceProfile.profile),
    serviceProfiles,
    defaultProfileId: defaultProfile.profile.profileId,
  };
};

const buildServiceProfile = (
  turnProfileConfig: ServiceTurnProfileConfig,
  input: TurnProfileRegistryInput,
): ServiceTurnProfile => {
  assertModel(turnProfileConfig, input.providers);
  assertToolPolicy(turnProfileConfig, input.toolNames);
  assertGuardIds(turnProfileConfig, input.guardIds);

  const prompt = input.promptBuilder(turnProfileConfig.prompt);
  return {
    prompt,
    profile: {
      profileId: turnProfileConfig.profileId,
      version: turnProfileConfig.version,
      displayName: turnProfileConfig.displayName,
      systemPromptId: prompt.promptId,
      systemInstructions: prompt.content,
      executorId: turnProfileConfig.executorId ?? EXECUTORS.AI_SDK_TOOL_LOOP.EXECUTOR_ID,
      modelPolicy: turnProfileConfig.model,
      callSettings: turnProfileConfig.callSettings,
      defaultToolPolicy: turnProfileConfig.toolPolicy,
      outputContract: turnProfileConfig.outputContract ?? DEFAULT_OUTPUT_CONTRACT,
      safetyPolicy: turnProfileConfig.safety,
    },
  };
};

const assertUniqueProfileIds = (turnProfiles: readonly ServiceTurnProfileConfig[]): void => {
  const seen = new Set<string>();
  for (const turnProfile of turnProfiles) {
    if (seen.has(turnProfile.profileId)) {
      throw new TurnProfileRegistryError(`Duplicate turn profile id ${turnProfile.profileId}.`);
    }
    seen.add(turnProfile.profileId);
  }
};

const assertDefaultProfilePresent = (input: TurnProfileRegistryInput): void => {
  if (input.turnProfiles.some((profile) => profile.profileId === input.defaultProfileId)) return;

  throw new TurnProfileRegistryError(
    `Default turn profile ${input.defaultProfileId} is not registered.`,
  );
};

const assertModel = (
  turnProfile: ServiceTurnProfileConfig,
  providers: readonly TurnProfileRegistryProvider[],
): void => {
  const provider = providers.find(
    (candidate) => candidate.providerId === turnProfile.model.providerId,
  );
  if (!provider) {
    throw new TurnProfileRegistryError(
      `Turn profile ${turnProfile.profileId} references unknown provider ${turnProfile.model.providerId}.`,
    );
  }
  if (!provider.modelIds.includes(turnProfile.model.modelId)) {
    throw new TurnProfileRegistryError(
      `Turn profile ${turnProfile.profileId} references unknown model ${turnProfile.model.modelId} for provider ${turnProfile.model.providerId}.`,
    );
  }

  for (const modelId of turnProfile.model.allowedModelIds ?? []) {
    if (provider.modelIds.includes(modelId)) continue;

    throw new TurnProfileRegistryError(
      `Turn profile ${turnProfile.profileId} allows unknown model ${modelId} for provider ${turnProfile.model.providerId}.`,
    );
  }
};

const assertToolPolicy = (
  turnProfile: ServiceTurnProfileConfig,
  toolNames: readonly string[],
): void => {
  const policy = turnProfile.toolPolicy;
  if (policy.mode === TOOL_POLICY_MODES.CLOSED) {
    if (policy.allowedToolNames.length > 0) {
      throw new TurnProfileRegistryError(
        `Turn profile ${turnProfile.profileId} uses a closed tool policy but lists allowed tool names.`,
      );
    }
    return;
  }

  if (policy.allowedToolNames.length === 0) {
    throw new TurnProfileRegistryError(
      `Turn profile ${turnProfile.profileId} uses a profile_allowlist tool policy but lists no tools.`,
    );
  }
  for (const toolName of policy.allowedToolNames) {
    if (!toolNames.includes(toolName)) {
      throw new TurnProfileRegistryError(
        `Turn profile ${turnProfile.profileId} allows unknown tool ${toolName}.`,
      );
    }
  }
};

const assertGuardIds = (
  turnProfile: ServiceTurnProfileConfig,
  guardIds: readonly string[],
): void => {
  for (const turnGuardId of turnProfile.safety.turnGuardIds) {
    if (!guardIds.includes(turnGuardId)) {
      throw new TurnProfileRegistryError(
        `Turn profile ${turnProfile.profileId} references unknown turn guard ${turnGuardId}.`,
      );
    }
  }
};
