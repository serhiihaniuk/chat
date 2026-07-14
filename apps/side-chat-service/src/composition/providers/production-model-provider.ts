import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@workflow/serde";

import { createAzureModelAdapter } from "#adapters/providers/azure-model-provider";
import { createOpenAIModelAdapter } from "#adapters/providers/openai-model-provider";
import {
  DURABLE_MODEL_HANDLE,
  type ModelProvider,
  type ModelReasoningEffort,
  type ProviderOptions,
} from "#application/ports/model-provider";
import { envValue, serviceProcessEnv } from "#config/environment/process-environment";
import { AZURE_PROVIDER, type AzureModelSettings } from "#config/providers/azure-provider-config";
import {
  OPENAI_PROVIDER,
  type OpenAIModelSettings,
} from "#config/providers/openai-provider-config";
import type { Settings } from "#config/settings/resolve-settings";

const PRODUCTION_MODEL_ERRORS = {
  UNSUPPORTED_PROVIDER: "Unsupported production model provider",
  OPENAI_CREDENTIAL_MISSING: "OpenAI provider credential is not configured",
  AZURE_CREDENTIAL_MISSING: "Azure OpenAI provider credential is not configured",
} as const;

export type ProductionModelDescriptor =
  | Readonly<{
      provider: typeof OPENAI_PROVIDER.KIND;
      modelId: string;
      baseUrl?: string | undefined;
    }>
  | Readonly<{
      provider: typeof AZURE_PROVIDER.KIND;
      modelId: string;
      endpoint: string;
      apiVersion: string;
      deployment: string;
    }>;

/**
 * The only production model value allowed into a WorkflowAgent.
 *
 * Workflow journals the non-secret descriptor through the custom serde hooks.
 * The provider SDK delegate exists only in the current realm and is rebuilt in
 * the durable step realm with the current credential from the environment.
 */
export class ProductionModelHandle implements LanguageModelV4 {
  readonly [DURABLE_MODEL_HANDLE] = true;

  constructor(
    private readonly descriptor: ProductionModelDescriptor,
    private readonly delegate: LanguageModelV4,
  ) {}

  get specificationVersion(): LanguageModelV4["specificationVersion"] {
    return this.delegate.specificationVersion;
  }

  get provider(): string {
    return this.delegate.provider;
  }

  get modelId(): string {
    return this.delegate.modelId;
  }

  get supportedUrls(): LanguageModelV4["supportedUrls"] {
    return this.delegate.supportedUrls;
  }

  static [WORKFLOW_SERIALIZE](instance: ProductionModelHandle): ProductionModelDescriptor {
    return instance.descriptor;
  }

  static [WORKFLOW_DESERIALIZE](descriptor: ProductionModelDescriptor): ProductionModelHandle {
    return new ProductionModelHandle(descriptor, reconstructRawModel(descriptor));
  }

  doGenerate(options: LanguageModelV4CallOptions): PromiseLike<LanguageModelV4GenerateResult> {
    return this.delegate.doGenerate(options);
  }

  doStream(options: LanguageModelV4CallOptions): PromiseLike<LanguageModelV4StreamResult> {
    return this.delegate.doStream(options);
  }
}

/** Production composition is fail-closed: scripted models never resolve here. */
export function createProductionModelProvider(settings: Settings): ModelProvider {
  const models = settings.models;
  if (models.provider === OPENAI_PROVIDER.KIND) {
    const adapter = createOpenAIModelAdapter({
      apiKey: models.connection.apiKey,
      configuredModelIds: configuredModelIds(settings),
      ...(models.connection.baseUrl === undefined ? {} : { baseUrl: models.connection.baseUrl }),
      ...(models.reasoningSummary === undefined
        ? {}
        : { reasoningSummary: models.reasoningSummary }),
    });
    return createSerializableModelProvider({
      modelFor: adapter.modelFor,
      descriptorFor: (modelId) => openAiDescriptor(models, modelId),
      providerOptions: adapter.providerOptions,
      providerOptionsFor: adapter.providerOptionsFor,
    });
  }
  if (models.provider === AZURE_PROVIDER.KIND) {
    const adapter = createAzureModelAdapter({
      ...models.connection,
      models: models.availableModels.map((model) => ({
        id: model.id,
        deployment: model.deployment,
      })),
    });
    return createSerializableModelProvider({
      modelFor: adapter.modelFor,
      descriptorFor: (modelId) => azureDescriptor(models, modelId),
    });
  }
  throw new Error(PRODUCTION_MODEL_ERRORS.UNSUPPORTED_PROVIDER);
}

function createSerializableModelProvider(options: {
  readonly modelFor: (modelId: string) => LanguageModelV4;
  readonly descriptorFor: (modelId: string) => ProductionModelDescriptor;
  readonly providerOptions?: ProviderOptions | undefined;
  readonly providerOptionsFor?: ((effort?: ModelReasoningEffort) => ProviderOptions) | undefined;
}): ModelProvider {
  return {
    modelFor: ({ modelId, reasoningEffort }) => {
      const delegate = options.modelFor(modelId);
      const model = new ProductionModelHandle(options.descriptorFor(modelId), delegate);
      if (options.providerOptionsFor !== undefined) {
        return {
          model,
          providerOptions: options.providerOptionsFor(reasoningEffort),
        };
      }
      if (options.providerOptions === undefined) return { model };
      return { model, providerOptions: options.providerOptions };
    },
  };
}

function openAiDescriptor(
  options: OpenAIModelSettings,
  modelId: string,
): ProductionModelDescriptor {
  if (options.connection.baseUrl === undefined) {
    return { provider: OPENAI_PROVIDER.KIND, modelId };
  }
  return {
    provider: OPENAI_PROVIDER.KIND,
    modelId,
    baseUrl: options.connection.baseUrl,
  };
}

function azureDescriptor(options: AzureModelSettings, modelId: string): ProductionModelDescriptor {
  const model = options.availableModels.find((candidate) => candidate.id === modelId);
  if (model === undefined) throw new Error(`Azure model is not configured: ${modelId}`);
  return {
    provider: AZURE_PROVIDER.KIND,
    modelId,
    endpoint: options.connection.endpoint,
    apiVersion: options.connection.apiVersion,
    deployment: model.deployment,
  };
}

function reconstructRawModel(descriptor: ProductionModelDescriptor): LanguageModelV4 {
  if (descriptor.provider === OPENAI_PROVIDER.KIND) {
    return reconstructOpenAiModel(descriptor);
  }
  if (descriptor.provider === AZURE_PROVIDER.KIND) {
    return reconstructAzureModel(descriptor);
  }
  throw new Error(PRODUCTION_MODEL_ERRORS.UNSUPPORTED_PROVIDER);
}

function reconstructOpenAiModel(
  descriptor: Extract<ProductionModelDescriptor, { provider: "openai" }>,
): LanguageModelV4 {
  const apiKey = requiredProviderCredential(
    OPENAI_PROVIDER.SECRET_ENV_KEYS.API_KEY,
    PRODUCTION_MODEL_ERRORS.OPENAI_CREDENTIAL_MISSING,
  );
  const adapter = createOpenAIModelAdapter({
    apiKey,
    configuredModelIds: [descriptor.modelId],
    ...(descriptor.baseUrl === undefined ? {} : { baseUrl: descriptor.baseUrl }),
  });
  return adapter.modelFor(descriptor.modelId);
}

function reconstructAzureModel(
  descriptor: Extract<ProductionModelDescriptor, { provider: "azure" }>,
): LanguageModelV4 {
  const apiKey = requiredProviderCredential(
    AZURE_PROVIDER.SECRET_ENV_KEYS.API_KEY,
    PRODUCTION_MODEL_ERRORS.AZURE_CREDENTIAL_MISSING,
  );
  const adapter = createAzureModelAdapter({
    apiKey,
    endpoint: descriptor.endpoint,
    apiVersion: descriptor.apiVersion,
    models: [{ id: descriptor.modelId, deployment: descriptor.deployment }],
  });
  return adapter.modelFor(descriptor.modelId);
}

function configuredModelIds(settings: Settings): readonly string[] {
  return [
    ...settings.models.availableModels.map((model) => model.id),
    settings.conversationTitle.modelId,
  ];
}

function requiredProviderCredential(key: string, missingMessage: string): string {
  const credential = envValue(serviceProcessEnv(), key);
  if (credential === undefined) throw new Error(missingMessage);
  return credential;
}
