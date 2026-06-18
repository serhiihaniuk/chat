import {
  createFakeProvider,
  createOpenAIResponsesProvider,
  type ModelProvider,
  type OpenAIReasoningEffort,
  type OpenAIReasoningSummary,
} from "@side-chat/agent-runtime";

/**
 * One source of truth for provider/model registration in service composition.
 *
 * This module turns operator-declared provider config into validated
 * registrations, the concrete `ModelProvider` list the runtime executes, and a
 * secret-free status the service exposes through diagnostics. The OpenAI provider
 * adapter enforces the declared retention/reasoning intent (`store: false`,
 * omitted reasoning summary); this registry is where that intent is declared.
 */

/**
 * Reasoning policy carried by a provider registration.
 *
 * Reuses the agent-runtime reasoning value types so service config and the
 * provider request preserve the same effort/summary. The registry keeps this
 * intent in one place for diagnostics and the provider request.
 */
export type ServiceReasoningPolicy = {
  /** Default effort used when a turn does not request one. */
  readonly effort: OpenAIReasoningEffort;
  /** Efforts the backend permits a browser request to select. */
  readonly allowedEfforts: readonly OpenAIReasoningEffort[];
  // Omitted by default: a summary is only requested when an operator opts in, so
  // reasoning stays hidden unless explicitly configured.
  readonly summary?: OpenAIReasoningSummary | undefined;
};

export type ServiceModelMetadata = {
  readonly modelId: string;
  readonly displayName: string;
  readonly contextWindowTokens?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
};

/**
 * Provider retention intent carried by a provider registration.
 *
 * `no_retention` is sent to OpenAI as `store: false` by the provider adapter so
 * prompts and responses are not retained. The registry records the declared
 * intent so the policy has one home and shows up in diagnostics.
 */
export const SERVICE_MODEL_RETENTION_POLICIES = {
  PROVIDER_DEFAULT: "provider_default",
  NO_RETENTION: "no_retention",
} as const;

export type ServiceModelRetentionPolicy =
  (typeof SERVICE_MODEL_RETENTION_POLICIES)[keyof typeof SERVICE_MODEL_RETENTION_POLICIES];

/**
 * Service-owned declaration of one provider and the models it may serve.
 *
 * Secrets (api key) and transport overrides stay inside the registration and
 * never reach the manifest, diagnostics, or browser. The registry builds the
 * concrete provider from these fields.
 */
export type ServiceProviderRegistration =
  | {
      readonly kind: "fake";
      readonly providerId: string;
      readonly modelIds: readonly string[];
      readonly defaultModelId: string;
    }
  | {
      readonly kind: "openai";
      readonly providerId: string;
      readonly modelIds: readonly string[];
      readonly defaultModelId: string;
      readonly modelMetadata?: readonly ServiceModelMetadata[] | undefined;
      readonly apiKey: string;
      readonly baseUrl?: string | undefined;
      readonly fetch?: typeof fetch | undefined;
      readonly retention: ServiceModelRetentionPolicy;
      readonly reasoning: ServiceReasoningPolicy;
    };

/** Secret-free provider summary exposed by service diagnostics. */
export type ServiceProviderStatus = {
  readonly providerId: string;
  readonly modelIds: readonly string[];
  readonly defaultModelId: string;
  readonly models: readonly ServiceModelMetadata[];
  readonly retention?: ServiceModelRetentionPolicy;
  readonly reasoning?: ServiceReasoningPolicy;
};

/** Provider registry status shape published by `/healthz` and `/readyz`. */
export type ServiceProviderRegistryStatus = {
  readonly defaultProviderId: string;
  readonly defaultModelId: string;
  readonly providers: readonly ServiceProviderStatus[];
};

/** Validated provider registry consumed by composition. */
export type ServiceProviderRegistry = {
  readonly providers: readonly ModelProvider[];
  readonly defaultProviderId: string;
  readonly defaultModelId: string;
  readonly status: ServiceProviderRegistryStatus;
};

/** Composition-time failure raised when provider registrations are invalid. */
export class ServiceProviderRegistryError extends Error {
  readonly code = "service_provider_registry_invalid";

  constructor(message: string) {
    super(message);
    this.name = "ServiceProviderRegistryError";
  }
}

/**
 * Validate provider registrations and return the runtime provider list.
 *
 * The first registration is the default; its `defaultModelId` becomes the model
 * the manifest reports. Validation fails closed before any route serves traffic,
 * so unsafe declarations never reach execution.
 */
export const createServiceProviderRegistry = (
  registrations: readonly ServiceProviderRegistration[],
): ServiceProviderRegistry => {
  if (registrations.length === 0) {
    throw new ServiceProviderRegistryError(
      "Service provider registry requires at least one provider registration.",
    );
  }

  const seenProviderIds = new Set<string>();
  for (const registration of registrations) {
    assertUniqueProviderId(seenProviderIds, registration.providerId);
    assertUniqueModelIds(registration);
    assertDefaultModelMembership(registration);
    assertModelMetadataMembership(registration);
    assertReasoningPolicy(registration);
  }

  const defaultRegistration = registrations[0] as ServiceProviderRegistration;
  return {
    providers: registrations.map(createModelProvider),
    defaultProviderId: defaultRegistration.providerId,
    defaultModelId: defaultRegistration.defaultModelId,
    status: {
      defaultProviderId: defaultRegistration.providerId,
      defaultModelId: defaultRegistration.defaultModelId,
      providers: registrations.map(toProviderStatus),
    },
  };
};

const assertUniqueProviderId = (seen: Set<string>, providerId: string): void => {
  if (seen.has(providerId)) {
    throw new ServiceProviderRegistryError(`Duplicate provider id ${providerId}.`);
  }
  seen.add(providerId);
};

const assertUniqueModelIds = (registration: ServiceProviderRegistration): void => {
  if (registration.modelIds.length === 0) {
    throw new ServiceProviderRegistryError(
      `Provider ${registration.providerId} requires at least one model id.`,
    );
  }

  const seen = new Set<string>();
  for (const modelId of registration.modelIds) {
    if (seen.has(modelId)) {
      throw new ServiceProviderRegistryError(
        `Duplicate model id ${modelId} in provider ${registration.providerId}.`,
      );
    }
    seen.add(modelId);
  }
};

const assertDefaultModelMembership = (registration: ServiceProviderRegistration): void => {
  if (registration.modelIds.includes(registration.defaultModelId)) return;

  throw new ServiceProviderRegistryError(
    `Default model ${registration.defaultModelId} is not registered for provider ${registration.providerId}.`,
  );
};

const assertModelMetadataMembership = (registration: ServiceProviderRegistration): void => {
  const metadata = registration.kind === "openai" ? registration.modelMetadata : undefined;
  if (!metadata) return;

  for (const model of metadata) {
    if (registration.modelIds.includes(model.modelId)) continue;

    throw new ServiceProviderRegistryError(
      `Model metadata references unknown model ${model.modelId} for provider ${registration.providerId}.`,
    );
  }
};

const assertReasoningPolicy = (registration: ServiceProviderRegistration): void => {
  if (registration.kind !== "openai") return;
  if (registration.reasoning.allowedEfforts.length === 0) {
    throw new ServiceProviderRegistryError(
      `Provider ${registration.providerId} requires at least one allowed reasoning effort.`,
    );
  }
  if (registration.reasoning.allowedEfforts.includes(registration.reasoning.effort)) return;

  throw new ServiceProviderRegistryError(
    `Default reasoning effort ${registration.reasoning.effort} is not allowed for provider ${registration.providerId}.`,
  );
};

const createModelProvider = (registration: ServiceProviderRegistration): ModelProvider => {
  if (registration.kind === "openai") {
    return createOpenAIResponsesProvider({
      apiKey: registration.apiKey,
      modelIds: registration.modelIds,
      baseUrl: registration.baseUrl,
      fetch: registration.fetch,
      reasoningEffort: registration.reasoning.effort,
      reasoningSummary: registration.reasoning.summary,
    });
  }

  return createFakeProvider({
    providerId: registration.providerId,
    modelIds: registration.modelIds,
  });
};

const toProviderStatus = (registration: ServiceProviderRegistration): ServiceProviderStatus => {
  const base: ServiceProviderStatus = {
    providerId: registration.providerId,
    modelIds: registration.modelIds,
    defaultModelId: registration.defaultModelId,
    models: normalizeModelMetadata(registration),
  };
  if (registration.kind === "openai") {
    return { ...base, retention: registration.retention, reasoning: registration.reasoning };
  }
  return base;
};

const normalizeModelMetadata = (
  registration: ServiceProviderRegistration,
): readonly ServiceModelMetadata[] => {
  const metadata = registration.kind === "openai" ? registration.modelMetadata : undefined;
  return registration.modelIds.map((modelId) => {
    const configured = metadata?.find((model) => model.modelId === modelId);
    return configured ?? { modelId, displayName: modelId };
  });
};
