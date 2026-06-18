import type { WorkspaceRef } from "@side-chat/partner-ai-core";
import { omitUndefinedProperties } from "@side-chat/shared";
import type { ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import type { PartnerAiServiceOptions } from "#inbound/http/app";
import { CAPABILITY_ENV_KEYS, createCapabilityConfigFromEnv } from "./service-capability-config.js";
import { ServiceConfigError } from "./service-config-error.js";
import { createModelMetadata } from "./model-catalog/service-model-metadata-config.js";
import {
  readOpenAIReasoningEffort,
  readOpenAIReasoningEfforts,
  readOpenAIReasoningSummary,
} from "./model-catalog/service-openai-reasoning-config.js";

export { ServiceConfigError } from "./service-config-error.js";

/**
 * Environment-to-service adapter for deployable Side Chat configuration.
 *
 * This file reads `SIDECHAT_*` process settings into HTTP, auth, policy,
 * persistence, runtime, and capability options consumed by app composition.
 * It validates operator intent and secret presence, but it does not open
 * providers, choose database clients, or build model-visible context.
 */
export const SERVICE_ENV_KEYS = {
  allowedModels: "SIDECHAT_ALLOWED_MODELS",
  authBearerToken: "SIDECHAT_AUTH_BEARER_TOKEN",
  ...CAPABILITY_ENV_KEYS,
  databaseUrl: "SIDECHAT_DATABASE_URL",
  modelContextWindows: "SIDECHAT_MODEL_CONTEXT_WINDOWS",
  openaiApiKey: "SIDECHAT_OPENAI_API_KEY",
  openaiBaseUrl: "SIDECHAT_OPENAI_BASE_URL",
  openaiReasoningEffort: "SIDECHAT_OPENAI_REASONING_EFFORT",
  openaiReasoningEfforts: "SIDECHAT_OPENAI_REASONING_EFFORTS",
  openaiReasoningSummary: "SIDECHAT_OPENAI_REASONING_SUMMARY",
  policyMode: "SIDECHAT_POLICY_MODE",
  profile: "SIDECHAT_PROFILE",
  provider: "SIDECHAT_PROVIDER",
  enableDevTools: "SIDECHAT_ENABLE_DEV_TOOLS",
  tenantId: "SIDECHAT_TENANT_ID",
  workspaceId: "SIDECHAT_WORKSPACE_ID",
} as const;

export const DEFAULT_SERVICE_PORT = 8787;
export const DEFAULT_TENANT_ID = "tenant_local";
export const DEFAULT_WORKSPACE_ID = "workspace_local";

type ServiceEnv = Readonly<Record<string, string | undefined>>;
type ServiceProfile = "development" | "production";
type PolicyMode = "allow_all" | "fail_closed" | "configured";

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
  });
};

export const readServicePort = (env: ServiceEnv = process.env): number => {
  const rawPort = envValue(env, "PORT");
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
  if (profile === "production") {
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

  if (profile === "development") {
    if (mode === "configured") {
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
  // Env declares the persistence mode by providing a database URL. The database
  // client is opened later by composition so config parsing stays side-effect
  // free and production can fail before routes are registered.
  const databaseUrl = envValue(env, SERVICE_ENV_KEYS.databaseUrl);
  if (databaseUrl) return { kind: "postgres", databaseUrl };
  if (profile === "production") {
    throw new ServiceConfigError("SIDECHAT_DATABASE_URL is required in production.");
  }
  return { kind: "memory" };
};

const readServiceProfile = (rawProfile: string | undefined): ServiceProfile => {
  if (!rawProfile) return "development";
  if (rawProfile === "development" || rawProfile === "production") {
    return rawProfile;
  }
  throw new ServiceConfigError("SIDECHAT_PROFILE must be development or production.");
};

const readPolicyMode = (profile: ServiceProfile, rawMode: string | undefined): PolicyMode => {
  if (!rawMode) {
    return profile === "production" ? "fail_closed" : "allow_all";
  }
  if (rawMode === "allow_all" || rawMode === "fail_closed" || rawMode === "configured") {
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
  if (profile === "production" && (!provider || provider === "fake")) {
    throw new ServiceConfigError("Production profile requires SIDECHAT_PROVIDER=openai.");
  }

  const resolvedProvider = provider ?? "fake";
  const enableMockWebSearch = readDevToolFlag(profile, env);
  if (resolvedProvider === "fake") return { provider: resolvedProvider, enableMockWebSearch };
  if (resolvedProvider !== "openai") {
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
    provider: "openai",
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
  if (profile === "production") {
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

const normalizeBearerToken = (token: string): string =>
  token.startsWith("Bearer ") ? token : `Bearer ${token}`;

const envValue = (env: ServiceEnv, key: string): string | undefined => {
  const value = env[key]?.trim();
  return value ? value : undefined;
};
