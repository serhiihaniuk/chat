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
 * Service-owned inputs for building the Azure OpenAI provider.
 *
 * Azure differs from plain OpenAI: it routes by a resource `endpoint`, an
 * `apiVersion`, and a per-model `deployment` name (which can differ from the
 * model id). `apiKey`, `endpoint`, `apiVersion`, and `fetch` are
 * agent-runtime-private transport inputs and must never reach the manifest,
 * diagnostics, or the browser. `modelIds`, `deploymentsByModelId`, and the
 * reasoning effort are the model-visible policy callers may see.
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
 * Map these provider options onto an AI SDK `createAzure` Chat Completions provider.
 *
 * At this boundary `endpoint` becomes the Azure `baseURL` (normalized to the
 * `/openai` deployment route) and the secret `apiKey` stays hidden inside
 * `createAzure`. `useDeploymentBasedUrls` selects the
 * `{baseURL}/deployments/{deployment}?api-version=` routing the Azure resource
 * exposes, so each model resolves to its configured deployment. The
 * model-id -> deployment indirection lives only here, so the runtime port keeps
 * speaking provider-neutral model ids. Reasoning effort is forwarded only for a
 * genuine effort, since the default deployments (e.g. gpt-4o) are non-reasoning
 * chat models that must not receive a reasoning option.
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
