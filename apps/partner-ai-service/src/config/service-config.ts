import type { WorkspaceRef } from "@side-chat/partner-ai-core";
import type { ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import type {
  OpenAIReasoningEffort,
  OpenAIReasoningSummary,
  RuntimeConfig,
} from "#composition/service-composition";
import type { PartnerAiServiceOptions } from "#inbound/http/app";

export const SERVICE_ENV_KEYS = {
  allowedModels: "SIDECHAT_ALLOWED_MODELS",
  authBearerToken: "SIDECHAT_AUTH_BEARER_TOKEN",
  databaseUrl: "SIDECHAT_DATABASE_URL",
  openaiApiKey: "SIDECHAT_OPENAI_API_KEY",
  openaiBaseUrl: "SIDECHAT_OPENAI_BASE_URL",
  openaiReasoningEffort: "SIDECHAT_OPENAI_REASONING_EFFORT",
  openaiReasoningSummary: "SIDECHAT_OPENAI_REASONING_SUMMARY",
  policyMode: "SIDECHAT_POLICY_MODE",
  profile: "SIDECHAT_PROFILE",
  provider: "SIDECHAT_PROVIDER",
  tenantId: "SIDECHAT_TENANT_ID",
  workspaceId: "SIDECHAT_WORKSPACE_ID",
} as const;

export const DEFAULT_SERVICE_PORT = 8787;
export const DEFAULT_TENANT_ID = "tenant_local";
export const DEFAULT_WORKSPACE_ID = "workspace_local";

type ServiceEnv = Readonly<Record<string, string | undefined>>;
type ServiceProfile = "development" | "production";
type PolicyMode = "allow_all" | "fail_closed" | "configured";

export class ServiceConfigError extends Error {
  readonly code = "service_config_invalid";

  constructor(message: string) {
    super(message);
    this.name = "ServiceConfigError";
  }
}

export const createPartnerAiServiceOptionsFromEnv = (
  env: ServiceEnv = process.env,
): PartnerAiServiceOptions => {
  const workspace = readWorkspace(env);
  const profile = readServiceProfile(envValue(env, SERVICE_ENV_KEYS.profile));

  const persistence = createPersistenceConfig(profile, env);
  return {
    workspace,
    auth: createAuthConfig(profile, workspace, envValue(env, SERVICE_ENV_KEYS.authBearerToken)),
    policies: createPolicyConfig(profile, env),
    runtime: createRuntimeConfig(env),
    ...(persistence ? { persistence } : {}),
  };
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
  const bearerToken = rawToken ? normalizeBearerToken(rawToken) : undefined;
  if (profile === "production") {
    return {
      profile,
      workspace,
      ...(bearerToken ? { trustedBearerToken: bearerToken } : {}),
    };
  }

  return {
    profile,
    workspace,
    ...(bearerToken ? { devBearerToken: bearerToken } : {}),
  };
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
  return {
    profile,
    mode,
    ...(allowedModels.length > 0 ? { allowedModels } : {}),
  };
};

const createPersistenceConfig = (
  profile: ServiceProfile,
  env: ServiceEnv,
): PartnerAiServiceOptions["persistence"] => {
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

const createRuntimeConfig = (env: ServiceEnv): RuntimeConfig => {
  const provider = envValue(env, SERVICE_ENV_KEYS.provider) ?? "fake";
  if (provider === "fake") return { provider };
  if (provider !== "openai") {
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
  return {
    provider,
    apiKey,
    modelIds,
    defaultModelId: modelIds[0] as string,
    ...(baseUrl ? { baseUrl } : {}),
    reasoningEffort: readOpenAIReasoningEffort(
      envValue(env, SERVICE_ENV_KEYS.openaiReasoningEffort),
    ),
    reasoningSummary: readOpenAIReasoningSummary(
      envValue(env, SERVICE_ENV_KEYS.openaiReasoningSummary),
    ),
  };
};

const openaiReasoningEfforts = new Set<OpenAIReasoningEffort>([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

const openaiReasoningSummaries = new Set<OpenAIReasoningSummary>(["auto", "concise", "detailed"]);

const readOpenAIReasoningEffort = (rawEffort: string | undefined): OpenAIReasoningEffort => {
  if (!rawEffort) return "medium";
  if (openaiReasoningEfforts.has(rawEffort as OpenAIReasoningEffort)) {
    return rawEffort as OpenAIReasoningEffort;
  }
  throw new ServiceConfigError(
    "SIDECHAT_OPENAI_REASONING_EFFORT must be none, minimal, low, medium, high, or xhigh.",
  );
};

const readOpenAIReasoningSummary = (rawSummary: string | undefined): OpenAIReasoningSummary => {
  if (!rawSummary) return "auto";
  if (openaiReasoningSummaries.has(rawSummary as OpenAIReasoningSummary)) {
    return rawSummary as OpenAIReasoningSummary;
  }
  throw new ServiceConfigError(
    "SIDECHAT_OPENAI_REASONING_SUMMARY must be auto, concise, or detailed.",
  );
};

const normalizeBearerToken = (token: string): string =>
  token.startsWith("Bearer ") ? token : `Bearer ${token}`;

const envValue = (env: ServiceEnv, key: string): string | undefined => {
  const value = env[key]?.trim();
  return value ? value : undefined;
};
