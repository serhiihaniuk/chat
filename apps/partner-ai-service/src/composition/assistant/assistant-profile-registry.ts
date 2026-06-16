import { DEFAULT_AGENT_EXECUTOR_ID } from "@side-chat/agent-runtime";
import type {
  AssistantProfile,
  OutputContract,
  ProfileId,
  ToolExposurePolicy,
} from "@side-chat/partner-ai-core";
import type {
  BuiltSystemPrompt,
  SystemPromptBuilder,
  SystemPromptDefinition,
} from "./system-prompt-builder.js";

/**
 * Service-owned assistant configuration consumed by the profile registry.
 *
 * The registry validates these values and returns the core `AssistantProfile`
 * the manifest publishes, so the default assistant and adopter assistants come
 * from one path.
 */
export type ServiceToolPolicyConfig = {
  readonly mode: "closed" | "profile_allowlist";
  readonly allowedToolNames?: readonly string[] | undefined;
};

export type ServiceAssistantSafetyConfig = {
  readonly policyId: string;
  readonly promptInjectionMode: "standard" | "strict";
  readonly turnGuardIds: readonly string[];
};

export type ServiceAssistantConfig = {
  readonly profileId: string;
  readonly version: string;
  readonly displayName: string;
  readonly prompt: SystemPromptDefinition;
  readonly executorId?: string | undefined;
  readonly model: { readonly providerId: string; readonly modelId: string };
  readonly toolPolicy: ServiceToolPolicyConfig;
  readonly outputContract?: OutputContract | undefined;
  readonly safety: ServiceAssistantSafetyConfig;
};

/**
 * Service-side assistant representation used by core policy.
 *
 * `profile` is the core `AssistantProfile` the manifest publishes; `prompt`
 * keeps the built prompt id, content, section ids, and hash next to it so the
 * service retains how the system instructions were assembled.
 */
export type ServiceAssistantProfile = {
  readonly profile: AssistantProfile;
  readonly prompt: BuiltSystemPrompt;
};

export type AssistantProfileRegistryProvider = {
  readonly providerId: string;
  readonly modelIds: readonly string[];
};

export type AssistantProfileRegistryInput = {
  readonly assistants: readonly ServiceAssistantConfig[];
  readonly defaultProfileId: string;
  readonly promptBuilder: SystemPromptBuilder;
  readonly providers: readonly AssistantProfileRegistryProvider[];
  readonly toolNames: readonly string[];
  readonly guardIds: readonly string[];
};

export type AssistantProfileRegistry = {
  readonly assistantProfiles: readonly AssistantProfile[];
  readonly serviceProfiles: readonly ServiceAssistantProfile[];
  readonly defaultProfileId: ProfileId;
};

/** Composition-time failure raised when assistant config is invalid. */
export class AssistantProfileRegistryError extends Error {
  readonly code = "service_assistant_registry_invalid";

  constructor(message: string) {
    super(message);
    this.name = "AssistantProfileRegistryError";
  }
}

/**
 * Validate assistant configs and build the manifest profiles from one path.
 *
 * Validation fails closed before any route serves traffic: the default profile
 * must exist, profile ids must be unique, and every model, tool name, guard id,
 * and tool policy shape must match the provider/tool/guard registries.
 */
export const createAssistantProfileRegistry = (
  input: AssistantProfileRegistryInput,
): AssistantProfileRegistry => {
  if (input.assistants.length === 0) {
    throw new AssistantProfileRegistryError(
      "Assistant profile registry requires at least one assistant config.",
    );
  }

  assertUniqueProfileIds(input.assistants);
  assertDefaultProfilePresent(input);

  const serviceProfiles = input.assistants.map((assistant) => buildServiceProfile(assistant, input));
  const defaultProfile = serviceProfiles.find(
    (serviceProfile) => serviceProfile.profile.profileId === input.defaultProfileId,
  ) as ServiceAssistantProfile;

  return {
    assistantProfiles: serviceProfiles.map((serviceProfile) => serviceProfile.profile),
    serviceProfiles,
    defaultProfileId: defaultProfile.profile.profileId,
  };
};

const buildServiceProfile = (
  assistant: ServiceAssistantConfig,
  input: AssistantProfileRegistryInput,
): ServiceAssistantProfile => {
  assertModel(assistant, input.providers);
  assertToolPolicy(assistant, input.toolNames);
  assertGuardIds(assistant, input.guardIds);

  const prompt = input.promptBuilder(assistant.prompt);
  return {
    prompt,
    profile: {
      profileId: assistant.profileId,
      version: assistant.version,
      displayName: assistant.displayName,
      systemPromptId: prompt.promptId,
      systemInstructions: prompt.content,
      executorId: assistant.executorId ?? DEFAULT_AGENT_EXECUTOR_ID,
      modelPolicy: { providerId: assistant.model.providerId, modelId: assistant.model.modelId },
      defaultToolPolicy: toToolExposurePolicy(assistant.toolPolicy),
      outputContract: assistant.outputContract ?? { format: "markdown" },
      safetyPolicy: {
        policyId: assistant.safety.policyId,
        promptInjectionMode: assistant.safety.promptInjectionMode,
        turnGuardIds: assistant.safety.turnGuardIds,
      },
    },
  };
};

const assertUniqueProfileIds = (assistants: readonly ServiceAssistantConfig[]): void => {
  const seen = new Set<string>();
  for (const assistant of assistants) {
    if (seen.has(assistant.profileId)) {
      throw new AssistantProfileRegistryError(
        `Duplicate assistant profile id ${assistant.profileId}.`,
      );
    }
    seen.add(assistant.profileId);
  }
};

const assertDefaultProfilePresent = (input: AssistantProfileRegistryInput): void => {
  if (input.assistants.some((assistant) => assistant.profileId === input.defaultProfileId)) return;

  throw new AssistantProfileRegistryError(
    `Default assistant profile ${input.defaultProfileId} is not registered.`,
  );
};

const assertModel = (
  assistant: ServiceAssistantConfig,
  providers: readonly AssistantProfileRegistryProvider[],
): void => {
  const provider = providers.find((candidate) => candidate.providerId === assistant.model.providerId);
  if (!provider) {
    throw new AssistantProfileRegistryError(
      `Assistant ${assistant.profileId} references unknown provider ${assistant.model.providerId}.`,
    );
  }
  if (!provider.modelIds.includes(assistant.model.modelId)) {
    throw new AssistantProfileRegistryError(
      `Assistant ${assistant.profileId} references unknown model ${assistant.model.modelId} for provider ${assistant.model.providerId}.`,
    );
  }
};

const assertToolPolicy = (
  assistant: ServiceAssistantConfig,
  toolNames: readonly string[],
): void => {
  const policy = assistant.toolPolicy;
  if (policy.mode === "closed") {
    if ((policy.allowedToolNames ?? []).length > 0) {
      throw new AssistantProfileRegistryError(
        `Assistant ${assistant.profileId} uses a closed tool policy but lists allowed tool names.`,
      );
    }
    return;
  }

  const allowed = policy.allowedToolNames ?? [];
  if (allowed.length === 0) {
    throw new AssistantProfileRegistryError(
      `Assistant ${assistant.profileId} uses a profile_allowlist tool policy but lists no tools.`,
    );
  }
  for (const toolName of allowed) {
    if (!toolNames.includes(toolName)) {
      throw new AssistantProfileRegistryError(
        `Assistant ${assistant.profileId} allows unknown tool ${toolName}.`,
      );
    }
  }
};

const assertGuardIds = (
  assistant: ServiceAssistantConfig,
  guardIds: readonly string[],
): void => {
  for (const turnGuardId of assistant.safety.turnGuardIds) {
    if (!guardIds.includes(turnGuardId)) {
      throw new AssistantProfileRegistryError(
        `Assistant ${assistant.profileId} references unknown turn guard ${turnGuardId}.`,
      );
    }
  }
};

const toToolExposurePolicy = (policy: ServiceToolPolicyConfig): ToolExposurePolicy => ({
  mode: policy.mode,
  allowedToolNames: policy.mode === "profile_allowlist" ? (policy.allowedToolNames ?? []) : [],
});
