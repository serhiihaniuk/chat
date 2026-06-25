import type { WorkspaceRef } from "@side-chat/partner-ai-core";
import { omitUndefinedProperties } from "@side-chat/shared";
import type { ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import type { PartnerAiServiceOptions } from "#inbound/http/app";
import {
  PROVIDERS,
  REQUEST_POLICY_MODES,
  SERVICE_PROFILES,
  type RequestPolicyMode,
  type ServiceProfileValue,
} from "./catalog/index.js";
import { createCapabilityConfigFromEnv } from "./service-capability-config.js";
import { createResumabilityConfigFromEnv } from "./env/service-resumability-config.js";
import { ServiceConfigError } from "./service-config-error.js";
import {
  DEFAULT_SERVICE_PORT,
  DEFAULT_TENANT_ID,
  DEFAULT_WORKSPACE_ID,
  SERVICE_ENV_KEYS,
  envValue,
  type ServiceEnv,
} from "./env/service-env-contract.js";
import { createModelMetadata } from "./model-catalog/service-model-metadata-config.js";
import {
  readOpenAIReasoningEffort,
  readOpenAIReasoningEfforts,
  readOpenAIReasoningSummary,
} from "./model-catalog/service-openai-reasoning-config.js";

export { ServiceConfigError } from "./service-config-error.js";
// Re-export the env contract so existing `#config/service-config` importers (auth,
// demo seed, tests) keep one entrypoint while the keys live in a cycle-free leaf.
export {
  DEFAULT_SERVICE_PORT,
  DEFAULT_TENANT_ID,
  DEFAULT_WORKSPACE_ID,
  SERVICE_ENV_KEYS,
} from "./env/service-env-contract.js";

/**
 * Environment-to-service adapter for deployable Side Chat configuration.
 *
 * Reads `SIDECHAT_*` process settings into HTTP, auth, policy, persistence,
 * runtime, and capability options for composition. It validates operator intent
 * and secret presence, but does not open providers, choose database clients, or
 * build model-visible context. The env key names and defaults live in
 * `service-env-contract.ts`.
 */
type ServiceProfile = ServiceProfileValue;
type PolicyMode = RequestPolicyMode;

/**
 * Translate process environment into the service composition options.
 *
 * Raw env values become typed service config here. Concrete resources are still
 * selected by composition, so failures in this file mean the declaration is
 * invalid or unsafe before any HTTP route or provider stream can start.
 */
export const createPartnerAiServiceOptionsFromEnv = (
  env: ServiceEnv = process.env,
): PartnerAiServiceOptions => {
  const workspace = readWorkspace(env);
  const profile = readServiceProfile(envValue(env, SERVICE_ENV_KEYS.profile));

  const persistence = createPersistenceConfig(profile, env);
  const capabilities = createCapabilityConfigFromEnv(env);
  return omitUndefinedProperties({
    workspace,
    auth: createAuthConfig(profile, workspace, envValue(env, SERVICE_ENV_KEYS.authBearerToken)),
    policies: createPolicyConfig(profile, env),
    runtime: createRuntimeConfig(profile, env),
    capabilities,
    persistence,
    resumability: createResumabilityConfigFromEnv(env),
  });
};

export const readServicePort = (env: ServiceEnv = process.env): number => {
  const rawPort = envValue(env, SERVICE_ENV_KEYS.port);
  if (!rawPort) return DEFAULT_SERVICE_PORT;
  if (!/^\d+$/.test(rawPort)) {
    throw new ServiceConfigError("PORT must be a numeric TCP port.");
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ServiceConfigError("PORT must be between 1 and 65535.");
  }
  return port;
};

export const readDemoSeedConversations = (env: ServiceEnv = process.env): boolean =>
  readBooleanFlag(envValue(env, SERVICE_ENV_KEYS.demoSeedConversations), false);

// The service is the single source of truth for the database connection
// (`SERVICE_ENV_KEYS.databaseUrl`); tooling resolves it here instead of
// re-reading the env contract.
export const readDatabaseUrl = (env: ServiceEnv = process.env): string | undefined =>
  envValue(env, SERVICE_ENV_KEYS.databaseUrl);

const readWorkspace = (env: ServiceEnv): WorkspaceRef => ({
  tenantId: envValue(env, SERVICE_ENV_KEYS.tenantId) ?? DEFAULT_TENANT_ID,
  workspaceId: envValue(env, SERVICE_ENV_KEYS.workspaceId) ?? DEFAULT_WORKSPACE_ID,
});

const createAuthConfig = (
  profile: ServiceProfile,
  workspace: WorkspaceRef,
  rawToken: string | undefined,
): ServiceAuthConfig => {
  // Normalize the bearer token shape without logging or exposing the token.
  // The auth adapter later decides whether it is a development or trusted
  // production credential.
  const bearerToken = rawToken ? normalizeBearerToken(rawToken) : undefined;
  if (profile === SERVICE_PROFILES.PRODUCTION) {
    return omitUndefinedProperties({
      profile,
      workspace,
      trustedBearerToken: bearerToken,
    });
  }

  return omitUndefinedProperties({
    profile,
    workspace,
    devBearerToken: bearerToken,
  });
};

const createPolicyConfig = (profile: ServiceProfile, env: ServiceEnv): ServicePolicyConfig => {
  const mode = readPolicyMode(profile, envValue(env, SERVICE_ENV_KEYS.policyMode));

  if (profile === SERVICE_PROFILES.DEVELOPMENT) {
    if (mode === REQUEST_POLICY_MODES.CONFIGURED) {
      throw new ServiceConfigError("Development policy supports allow_all or fail_closed only.");
    }
    return { profile, mode };
  }

  const allowedModels = readAllowedModels(env);
  return omitUndefinedProperties({
    profile,
    mode,
    allowedModels: allowedModels.length > 0 ? allowedModels : undefined,
  });
};

const createPersistenceConfig = (
  profile: ServiceProfile,
  env: ServiceEnv,
): PartnerAiServiceOptions["persistence"] => {
  // Env declares the persistence mode by providing a database URL; composition
  // opens the client later, so config parsing stays side-effect free.
  const databaseUrl = envValue(env, SERVICE_ENV_KEYS.databaseUrl);
  if (databaseUrl) return { kind: "postgres", databaseUrl };
  if (profile === SERVICE_PROFILES.PRODUCTION) {
    throw new ServiceConfigError("SIDECHAT_DATABASE_URL is required in production.");
  }
  return { kind: "memory" };
};

const readServiceProfile = (rawProfile: string | undefined): ServiceProfile => {
  if (!rawProfile) return SERVICE_PROFILES.DEVELOPMENT;
  if (rawProfile === SERVICE_PROFILES.DEVELOPMENT || rawProfile === SERVICE_PROFILES.PRODUCTION) {
    return rawProfile;
  }
  throw new ServiceConfigError("SIDECHAT_PROFILE must be development or production.");
};

const readPolicyMode = (profile: ServiceProfile, rawMode: string | undefined): PolicyMode => {
  if (!rawMode) {
    return profile === SERVICE_PROFILES.PRODUCTION
      ? REQUEST_POLICY_MODES.FAIL_CLOSED
      : REQUEST_POLICY_MODES.ALLOW_ALL;
  }
  if (
    rawMode === REQUEST_POLICY_MODES.ALLOW_ALL ||
    rawMode === REQUEST_POLICY_MODES.FAIL_CLOSED ||
    rawMode === REQUEST_POLICY_MODES.CONFIGURED
  ) {
    return rawMode;
  }
  throw new ServiceConfigError(
    "SIDECHAT_POLICY_MODE must be allow_all, fail_closed, or configured.",
  );
};

const readAllowedModels = (env: ServiceEnv): readonly string[] => {
  const rawModels = envValue(env, SERVICE_ENV_KEYS.allowedModels);
  if (!rawModels) return [];
  return rawModels
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
};

const createRuntimeConfig = (
  profile: ServiceProfile,
  env: ServiceEnv,
): NonNullable<PartnerAiServiceOptions["runtime"]> => {
  // Choose the runtime declaration only. Runtime composition later turns this
  // into provider registrations, keeping provider SDK objects out of config.
  const provider = envValue(env, SERVICE_ENV_KEYS.provider);
  if (profile === SERVICE_PROFILES.PRODUCTION && (!provider || provider === PROVIDERS.FAKE.KIND)) {
    throw new ServiceConfigError("Production profile requires SIDECHAT_PROVIDER=openai.");
  }

  const resolvedProvider = provider ?? PROVIDERS.FAKE.KIND;
  const enableMockWebSearch = readDevToolFlag(profile, env);
  if (resolvedProvider === PROVIDERS.FAKE.KIND) {
    return { provider: PROVIDERS.FAKE.KIND, enableMockWebSearch };
  }
  // Azure is configured through the readable sidechat.config.ts (per-model
  // deployments); the legacy env-only parser stays OpenAI/fake.
  if (resolvedProvider !== PROVIDERS.OPENAI.KIND) {
    throw new ServiceConfigError("SIDECHAT_PROVIDER must be fake or openai.");
  }

  const apiKey = envValue(env, SERVICE_ENV_KEYS.openaiApiKey);
  if (!apiKey) {
    throw new ServiceConfigError(
      "SIDECHAT_OPENAI_API_KEY is required when SIDECHAT_PROVIDER=openai.",
    );
  }
  const modelIds = readAllowedModels(env);
  if (modelIds.length === 0) {
    throw new ServiceConfigError(
      "SIDECHAT_ALLOWED_MODELS is required when SIDECHAT_PROVIDER=openai.",
    );
  }

  const baseUrl = envValue(env, SERVICE_ENV_KEYS.openaiBaseUrl);
  const reasoningEffort = readOpenAIReasoningEffort(
    envValue(env, SERVICE_ENV_KEYS.openaiReasoningEffort),
  );
  return omitUndefinedProperties({
    provider: PROVIDERS.OPENAI.KIND,
    apiKey,
    modelIds,
    defaultModelId: modelIds[0] as string,
    modelMetadata: createModelMetadata(modelIds, env),
    enableMockWebSearch,
    baseUrl,
    reasoningEffort,
    reasoningEfforts: readOpenAIReasoningEfforts(
      envValue(env, SERVICE_ENV_KEYS.openaiReasoningEfforts),
      reasoningEffort,
    ),
    reasoningSummary: readOpenAIReasoningSummary(
      envValue(env, SERVICE_ENV_KEYS.openaiReasoningSummary),
    ),
  });
};

const readDevToolFlag = (profile: ServiceProfile, env: ServiceEnv): boolean => {
  const rawFlag = envValue(env, SERVICE_ENV_KEYS.enableDevTools);
  if (profile === SERVICE_PROFILES.PRODUCTION) {
    if (rawFlag === "true") {
      throw new ServiceConfigError("SIDECHAT_ENABLE_DEV_TOOLS is not allowed in production.");
    }
    return false;
  }
  if (!rawFlag) return true;
  if (rawFlag === "true") return true;
  if (rawFlag === "false") return false;
  throw new ServiceConfigError("SIDECHAT_ENABLE_DEV_TOOLS must be true or false.");
};

const readBooleanFlag = (rawFlag: string | undefined, fallback: boolean): boolean => {
  if (!rawFlag) return fallback;
  if (rawFlag === "true") return true;
  if (rawFlag === "false") return false;
  throw new ServiceConfigError("Boolean service flags must be true or false.");
};

const normalizeBearerToken = (token: string): string =>
  token.startsWith("Bearer ") ? token : `Bearer ${token}`;
