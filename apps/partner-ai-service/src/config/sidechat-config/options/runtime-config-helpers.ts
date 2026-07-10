import { omitUndefinedProperties } from "@side-chat/shared";
import type {
  RuntimeModelMetadata,
  RuntimeToolConfig,
} from "#composition/service-composition-types";
import type { PartnerAiServiceOptions } from "#inbound/http/app";
import { PROVIDERS } from "../../catalog/providers.js";
import { ServiceConfigError } from "../../service-config-error.js";
import { readRequiredStringEnvReference, readStringEnvReference } from "../environment.js";
import type { SideChatStringEnvReference } from "../env-references.js";
import type {
  ServiceEnv,
  SideChatConfig,
  SideChatConfiguredModel,
  SideChatModelDescriptor,
} from "../types.js";
import { readDefaultConfiguredModel } from "../validation.js";

/**
 * Project enabled config models into the publishable runtime model-metadata list.
 *
 * Shared by every provider branch of the readable-config runtime resolver: it
 * copies only model-visible facts (id, display name, token windows), never the
 * connection transport.
 */
export const createRuntimeModelMetadata = (
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

/**
 * Resolve the Azure runtime declaration from the readable config's env references.
 *
 * `apiKey` and `endpoint` are required; `apiVersion` is optional (the AI SDK
 * defaults it). Each enabled model's deployment is resolved from the connection's
 * `deployments` map, keeping the model-id -> deployment indirection in config.
 */
export const createAzureRuntimeConfig = (
  config: SideChatConfig,
  env: ServiceEnv,
  defaultModelId: string,
  toolConfig: Pick<RuntimeToolConfig, "tools" | "hostCommands">,
): NonNullable<PartnerAiServiceOptions["runtime"]> => {
  const provider = readAzureProviderConfig(config);
  const context = "when sidechat.config.ts enables Azure OpenAI models";
  const defaultModel = readDefaultConfiguredModel(config);
  return omitUndefinedProperties({
    provider: PROVIDERS.AZURE.KIND,
    apiKey: readRequiredStringEnvReference(env, provider.connection.apiKey, context),
    endpoint: readRequiredStringEnvReference(env, provider.connection.endpoint, context),
    apiVersion: readStringEnvReference(env, provider.connection.apiVersion),
    modelIds: config.models.availableModels.map((entry) => entry.model.MODEL_ID),
    defaultModelId,
    modelMetadata: createRuntimeModelMetadata(config.models.availableModels),
    deploymentsByModelId: readAzureDeployments(env, provider.connection.deployments),
    reasoningEffort: config.models.default.reasoning,
    reasoningEfforts: defaultModel.reasoning.options,
    ...toolConfig,
  });
};

const readAzureProviderConfig = (
  config: SideChatConfig,
): Extract<
  SideChatConfig["models"]["provider"],
  { readonly kind: typeof PROVIDERS.AZURE.KIND }
> => {
  if (config.models.provider.kind === PROVIDERS.AZURE.KIND) return config.models.provider;

  throw new ServiceConfigError("Azure models require an Azure provider connection config.");
};

const readAzureDeployments = (
  env: ServiceEnv,
  deployments: Readonly<Record<string, SideChatStringEnvReference>>,
): Record<string, string> => {
  const resolved: Record<string, string> = {};
  for (const [modelId, reference] of Object.entries(deployments)) {
    resolved[modelId] = readRequiredStringEnvReference(
      env,
      reference,
      `for the Azure deployment of model ${modelId}`,
    );
  }
  return resolved;
};
