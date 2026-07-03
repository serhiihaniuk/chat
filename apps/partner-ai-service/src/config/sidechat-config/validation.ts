import { availableToolNames } from "#adapters/tools/tool-registrations";
import { AUXILIARY_JOBS } from "../catalog/capabilities/auxiliary-jobs.js";
import { TOOL_DEFAULT_EXPOSURE, TOOL_POLICY_MODES } from "../catalog/config-values.js";
import { PROVIDERS } from "../catalog/providers.js";
import { ServiceConfigError } from "../service-config-error.js";
import type {
  SideChatConfig,
  SideChatConfiguredModel,
  SideChatModelDescriptor,
  SideChatToolConfig,
} from "./types.js";

export type ConfigProviderKind =
  | typeof PROVIDERS.FAKE.KIND
  | typeof PROVIDERS.OPENAI.KIND
  | typeof PROVIDERS.AZURE.KIND;

export const validateSideChatConfig = (config: SideChatConfig): void => {
  assertAvailableModels(config);
  assertConfiguredProviderMatchesModels(config);
  assertAzureDeployments(config);
  assertCurrentRuntimeReasoningShape(config);
  assertRequestPolicyModels(config);
  assertExecutors(config);
  assertToolConfig(config);
  assertConversationTitleJobs(config);
  assertContextConfig(config);
  assertUnsupportedConfigSurfaces(config);
};

export const readProviderKindForConfig = (config: SideChatConfig): ConfigProviderKind => {
  const providerKinds = new Set(config.models.availableModels.map(providerKindForModel));
  if (providerKinds.size !== 1) {
    throw new ServiceConfigError(
      "sidechat.config.ts currently supports one provider per service config.",
    );
  }

  return [...providerKinds][0] as ConfigProviderKind;
};

export const readDefaultConfiguredModel = (
  config: SideChatConfig,
): SideChatConfiguredModel<SideChatModelDescriptor> => {
  const defaultModelId = config.models.default.model.MODEL_ID;
  const entry = config.models.availableModels.find(
    (candidate) => candidate.model.MODEL_ID === defaultModelId,
  );
  if (entry) return entry;

  throw new ServiceConfigError(`Default model ${defaultModelId} is not enabled.`);
};

const assertAvailableModels = (config: SideChatConfig): void => {
  if (config.models.availableModels.length === 0) {
    throw new ServiceConfigError("sidechat.config.ts requires at least one enabled model.");
  }

  const seenModelIds = new Set<string>();
  for (const entry of config.models.availableModels) {
    const modelId = entry.model.MODEL_ID;
    if (seenModelIds.has(modelId)) {
      throw new ServiceConfigError(`Duplicate model ${modelId} in sidechat.config.ts.`);
    }
    seenModelIds.add(modelId);
    assertReasoningConfig(entry);
  }

  const defaultEntry = readDefaultConfiguredModel(config);
  if (defaultEntry.reasoning.default !== config.models.default.reasoning) {
    throw new ServiceConfigError(
      `Default reasoning effort for ${config.models.default.model.MODEL_ID} must match its configured model entry.`,
    );
  }
};

const assertReasoningConfig = (entry: SideChatConfiguredModel<SideChatModelDescriptor>): void => {
  if (entry.reasoning.options.length === 0) {
    throw new ServiceConfigError(`Model ${entry.model.MODEL_ID} needs reasoning options.`);
  }
  if (!entry.reasoning.options.includes(entry.reasoning.default)) {
    throw new ServiceConfigError(
      `Default reasoning effort ${entry.reasoning.default} is not available for ${entry.model.MODEL_ID}.`,
    );
  }

  for (const effort of entry.reasoning.options) {
    if (entry.model.SUPPORTED_REASONING_EFFORTS.includes(effort)) continue;

    throw new ServiceConfigError(
      `Reasoning effort ${effort} is not supported by ${entry.model.MODEL_ID}.`,
    );
  }
};

const assertConfiguredProviderMatchesModels = (config: SideChatConfig): void => {
  const modelProviderKind = readProviderKindForConfig(config);
  if (config.models.provider.kind === modelProviderKind) return;

  throw new ServiceConfigError(
    `Configured provider ${config.models.provider.kind} does not match enabled ${modelProviderKind} models.`,
  );
};

const assertAzureDeployments = (config: SideChatConfig): void => {
  if (config.models.provider.kind !== PROVIDERS.AZURE.KIND) return;

  const deployments = config.models.provider.connection.deployments;
  for (const entry of config.models.availableModels) {
    if (entry.model.MODEL_ID in deployments) continue;

    throw new ServiceConfigError(
      `Azure model ${entry.model.MODEL_ID} is missing a deployment in the provider connection.`,
    );
  }
};

const assertCurrentRuntimeReasoningShape = (config: SideChatConfig): void => {
  const [first, ...rest] = config.models.availableModels;
  if (!first) return;

  for (const entry of rest) {
    if (sameValues(entry.reasoning.options, first.reasoning.options)) continue;

    throw new ServiceConfigError(
      "Phase 3 provider wiring requires configured models to share reasoning options until per-model provider reasoning is migrated.",
    );
  }
};

const assertRequestPolicyModels = (config: SideChatConfig): void => {
  const modelIds = new Set(config.models.availableModels.map((entry) => entry.model.MODEL_ID));
  for (const modelId of config.requestPolicy.modelEntitlements.modelIds) {
    if (modelIds.has(modelId)) continue;

    throw new ServiceConfigError(
      `Request policy references model ${modelId} that is not enabled in sidechat.config.ts.`,
    );
  }
};

const assertExecutors = (config: SideChatConfig): void => {
  const executorIds = config.executors.availableExecutors.map((executor) => executor.EXECUTOR_ID);
  if (executorIds.includes(config.executors.default.EXECUTOR_ID)) return;

  throw new ServiceConfigError(
    `Default executor ${config.executors.default.EXECUTOR_ID} is not listed in available executors.`,
  );
};

const assertToolConfig = (config: SideChatConfig): void => {
  const toolIndex = createToolIndex(config.tools.availableTools);
  assertProfileToolPolicy(config.chat.turnProfile.tools, toolIndex);
};

type ToolIndex = {
  readonly configuredToolNames: ReadonlySet<string>;
  readonly defaultEnabledToolNames: ReadonlySet<string>;
};

const createToolIndex = (toolConfigs: readonly SideChatToolConfig[]): ToolIndex => {
  const configuredToolNames = new Set<string>();
  const defaultEnabledToolNames = new Set<string>();
  for (const toolConfig of toolConfigs) {
    assertConfiguredTool(toolConfig, configuredToolNames);
    configuredToolNames.add(toolConfig.tool.NAME);
    if (toolConfig.exposure.defaultMode === TOOL_DEFAULT_EXPOSURE.ENABLED) {
      defaultEnabledToolNames.add(toolConfig.tool.NAME);
    }
  }

  return { configuredToolNames, defaultEnabledToolNames };
};

const assertConfiguredTool = (
  toolConfig: SideChatToolConfig,
  configuredToolNames: ReadonlySet<string>,
): void => {
  if (configuredToolNames.has(toolConfig.tool.NAME)) {
    throw new ServiceConfigError(`Duplicate configured tool ${toolConfig.tool.NAME}.`);
  }
  if (!availableToolNames().includes(toolConfig.tool.NAME)) {
    throw new ServiceConfigError(
      `Unsupported configured tool ${toolConfig.tool.NAME}. Available tools: ${availableToolNames().join(", ")}.`,
    );
  }
  if (toolConfig.parameters.delayMs !== undefined && toolConfig.parameters.delayMs < 0) {
    throw new ServiceConfigError(`${toolConfig.tool.NAME} delayMs must not be negative.`);
  }
};

const assertProfileToolPolicy = (
  toolPolicy: SideChatConfig["chat"]["turnProfile"]["tools"],
  toolIndex: ToolIndex,
): void => {
  if (toolPolicy.mode === TOOL_POLICY_MODES.CLOSED) {
    assertClosedToolPolicy(toolPolicy.names);
    return;
  }

  for (const toolName of toolPolicy.names) {
    assertProfileToolName(toolName, toolIndex);
  }
};

const assertClosedToolPolicy = (toolNames: readonly string[]): void => {
  if (toolNames.length === 0) return;
  throw new ServiceConfigError("Closed turn profile tool policy cannot list tool names.");
};

const assertProfileToolName = (toolName: string, toolIndex: ToolIndex): void => {
  if (!toolIndex.configuredToolNames.has(toolName)) {
    throw new ServiceConfigError(`Turn profile allows unknown tool ${toolName}.`);
  }
  if (toolIndex.defaultEnabledToolNames.has(toolName)) return;

  throw new ServiceConfigError(`Turn profile allows disabled-by-default tool ${toolName}.`);
};

const assertConversationTitleJobs = (config: SideChatConfig): void => {
  const seenJobIds = new Set<string>();
  for (const jobConfig of config.auxiliaryModelJobs.availableJobs) {
    const jobId = String(jobConfig.job.JOB_ID);
    if (jobConfig.job.JOB_ID !== AUXILIARY_JOBS.CONVERSATION_TITLE.JOB_ID) {
      throw new ServiceConfigError(`Unsupported auxiliary model job ${jobId}.`);
    }
    if (seenJobIds.has(jobId)) {
      throw new ServiceConfigError(`Duplicate auxiliary model job ${jobId}.`);
    }
    seenJobIds.add(jobId);
  }
};

const assertContextConfig = (config: SideChatConfig): void => {
  if (
    config.context.contextAdmission.reservedOutputTokens <
    config.context.contextAdmission.maxInputTokens
  ) {
    return;
  }

  throw new ServiceConfigError(
    "sidechat.config.ts context reservedOutputTokens must be lower than maxInputTokens.",
  );
};

const assertUnsupportedConfigSurfaces = (config: SideChatConfig): void => {
  if (config.hostCommands.activityRenderers.length === 0) return;

  throw new ServiceConfigError(
    "Activity renderers are cataloged in config but not wired into the Phase 3 service manifest yet.",
  );
};

const providerKindForModel = (
  modelConfig: SideChatConfiguredModel<SideChatModelDescriptor>,
): ConfigProviderKind => {
  const modelId = modelConfig.model.MODEL_ID;
  if (fakeModelIds.has(modelId)) return PROVIDERS.FAKE.KIND;
  if (openAIModelIds.has(modelId)) return PROVIDERS.OPENAI.KIND;
  if (azureModelIds.has(modelId)) return PROVIDERS.AZURE.KIND;

  throw new ServiceConfigError(`Model ${modelId} is not declared in the provider catalog.`);
};

const sameValues = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const fakeModelIds: ReadonlySet<string> = new Set(
  Object.values(PROVIDERS.FAKE.MODELS).map((model) => model.MODEL_ID),
);
const openAIModelIds: ReadonlySet<string> = new Set(
  Object.values(PROVIDERS.OPENAI.MODELS).map((model) => model.MODEL_ID),
);
const azureModelIds: ReadonlySet<string> = new Set(
  Object.values(PROVIDERS.AZURE.MODELS).map((model) => model.MODEL_ID),
);
