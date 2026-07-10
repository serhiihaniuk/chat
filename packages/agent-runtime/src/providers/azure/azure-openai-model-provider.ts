import { Effect } from "effect";
import { createAzure } from "@ai-sdk/azure";
import { omitUndefinedProperties } from "@side-chat/shared";
import {
  AiRuntimeError,
  RUNTIME_ERROR_CODES,
  RUNTIME_REASONING_EFFORTS,
  type RuntimeReasoningEffort,
} from "@side-chat/ai-runtime-contract";

import type { ModelProvider } from "#providers/model-provider";

export const AZURE_OPENAI_PROVIDER_ID = "azure" as const;

/**
 * Private inputs used to build an Azure OpenAI provider.
 *
 * Azure routes by endpoint, API version, and deployment name. The deployment
 * name may differ from the model id. The key, endpoint, API version, and fetch
 * function stay inside agent-runtime; they must not reach manifests, logs, or
 * the browser. Model ids, deployment mappings, and reasoning settings are the
 * policy-level values callers may see.
 */
export type AzureOpenAIProviderOptions = {
  readonly apiKey: string;
  readonly endpoint: string;
  readonly apiVersion?: string | undefined;
  readonly modelIds: readonly string[];
  /** Maps each enabled model id to its Azure deployment name (custom per model). */
  readonly deploymentsByModelId: Readonly<Record<string, string>>;
  readonly reasoningEffort?: RuntimeReasoningEffort | undefined;
  readonly fetch?: typeof fetch | undefined;
};

export const AZURE_OPENAI_REASONING_EFFORTS = RUNTIME_REASONING_EFFORTS;

export type AzureOpenAIReasoningEffort = RuntimeReasoningEffort;

/**
 * Map the private settings to the AI SDK Azure provider.
 *
 * Normalize the endpoint to Azure's `/openai` route and keep the API key inside
 * `createAzure`. When deployment-based URLs are enabled, resolve each provider-
 * neutral model id to its configured deployment here. Forward reasoning only
 * when it is set; non-reasoning chat models must not receive that option.
 */
export const createAzureOpenAIProvider = (options: AzureOpenAIProviderOptions): ModelProvider => {
  if (options.apiKey.trim().length === 0) {
    throw new AiRuntimeError(
      RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE,
      "Azure OpenAI provider requires an API key.",
    );
  }
  if (options.endpoint.trim().length === 0) {
    throw new AiRuntimeError(
      RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE,
      "Azure OpenAI provider requires a resource endpoint.",
    );
  }
  if (options.modelIds.length === 0) {
    throw new AiRuntimeError(
      RUNTIME_ERROR_CODES.MODEL_UNAVAILABLE,
      "Azure OpenAI provider requires at least one allowed model id.",
    );
  }

  const azure = createAzure(
    omitUndefinedProperties({
      baseURL: azureBaseUrl(options.endpoint),
      apiKey: options.apiKey,
      apiVersion: options.apiVersion,
      // Use the `/openai/deployments/{deployment}` routing an Azure resource
      // exposes (the form the configured deployment names target).
      useDeploymentBasedUrls: true,
      fetch: options.fetch,
    }),
  );

  return {
    providerId: AZURE_OPENAI_PROVIDER_ID,
    modelIds: options.modelIds,
    resolveModel: (selection) =>
      Effect.succeed(azure.chat(deploymentForModel(options, selection.modelId))),
    resolveProviderOptions: (selection) =>
      Effect.succeed(azureProviderOptions(options, selection.reasoning?.effort)),
  };
};

/**
 * Resolve the Azure deployment for a selected model id.
 *
 * Deployment names are configured per model; a missing entry falls back to the
 * model id so a deployment named identically to the model still works.
 */
const deploymentForModel = (options: AzureOpenAIProviderOptions, modelId: string): string =>
  options.deploymentsByModelId[modelId] ?? modelId;

/**
 * Normalize a resource endpoint into the Azure deployment base URL.
 *
 * Azure portal endpoints look like `https://<resource>.cognitiveservices.azure.com`
 * (or `.openai.azure.com`); the deployment routing appends `/deployments/{deployment}`,
 * so the base must end in `/openai`. Trailing slashes are trimmed and `/openai`
 * is added when the operator did not include it.
 */
const azureBaseUrl = (endpoint: string): string => {
  const trimmed = endpoint.replace(/\/+$/u, "");
  return trimmed.endsWith("/openai") ? trimmed : `${trimmed}/openai`;
};

/**
 * Forward reasoning effort under the OpenAI-compatible namespace, or nothing.
 *
 * A non-reasoning chat deployment must not receive a reasoning option, so an
 * absent or `none` effort yields no provider options at all.
 */
const azureProviderOptions = (
  options: AzureOpenAIProviderOptions,
  requestedEffort: RuntimeReasoningEffort | undefined,
): { readonly openai: { readonly reasoningEffort: RuntimeReasoningEffort } } | undefined => {
  const effort = requestedEffort ?? options.reasoningEffort;
  if (!effort || effort === RUNTIME_REASONING_EFFORTS.NONE) return undefined;
  return { openai: { reasoningEffort: effort } };
};
