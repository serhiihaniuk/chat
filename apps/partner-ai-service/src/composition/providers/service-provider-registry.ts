import {
  createFakeProvider,
  createOpenAIResponsesProvider,
  type ModelProvider,
} from "@side-chat/agent-runtime";

/**
 * One source of truth for provider/model registration in service composition.
 *
 * This module turns operator-declared provider config into validated
 * registrations, the concrete `ModelProvider` list the runtime executes, and a
 * secret-free status the service exposes through diagnostics. Provider request
 * hardening (OpenAI `store: false`, hidden reasoning) lands in Phase 10; this
 * registry only records the declared retention and reasoning intent.
 */

/** OpenAI reasoning effort carried by an OpenAI provider registration. */
export type OpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** OpenAI reasoning summary visibility carried by an OpenAI provider registration. */
export type OpenAIReasoningSummary = "auto" | "concise" | "detailed";

/**
 * Reasoning policy carried by a provider registration.
 *
 * The registry records this intent so diagnostics and the Phase 10 provider
 * request hardening read one source instead of re-deriving it per call site.
 */
export type ServiceReasoningPolicy = {
  readonly effort: OpenAIReasoningEffort;
  readonly summary: OpenAIReasoningSummary;
};

/**
 * Provider retention intent carried by a provider registration.
 *
 * `no_retention` becomes `store: false` request hardening in Phase 10. Phase 3
 * only records the declared intent so the policy has one home.
 */
export type ServiceModelRetentionPolicy = "provider_default" | "no_retention";

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
  };
  if (registration.kind === "openai") {
    return { ...base, retention: registration.retention, reasoning: registration.reasoning };
  }
  return base;
};
