import type { WorkspaceRef } from "@side-chat/partner-ai-core";
import type { ServiceAuthConfig } from "../adapters/auth/service-auth.js";
import type { ServicePolicyConfig } from "../adapters/policy/service-policy.js";
import type { PartnerAiServiceOptions } from "../inbound/http/app.js";

const DEFAULT_SERVICE_PORT = 8787;
const DEFAULT_TENANT_ID = "tenant_local";
const DEFAULT_WORKSPACE_ID = "workspace_local";

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
  const profile = readServiceProfile(envValue(env, "SIDECHAT_PROFILE"));

  const persistence = createPersistenceConfig(profile, env);
  return {
    workspace,
    auth: createAuthConfig(
      profile,
      workspace,
      envValue(env, "SIDECHAT_AUTH_BEARER_TOKEN"),
    ),
    policies: createPolicyConfig(profile, env),
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
  tenantId: envValue(env, "SIDECHAT_TENANT_ID") ?? DEFAULT_TENANT_ID,
  workspaceId: envValue(env, "SIDECHAT_WORKSPACE_ID") ?? DEFAULT_WORKSPACE_ID,
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

const createPolicyConfig = (
  profile: ServiceProfile,
  env: ServiceEnv,
): ServicePolicyConfig => {
  const mode = readPolicyMode(profile, envValue(env, "SIDECHAT_POLICY_MODE"));

  if (profile === "development") {
    if (mode === "configured") {
      throw new ServiceConfigError(
        "Development policy supports allow_all or fail_closed only.",
      );
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
  const databaseUrl = envValue(env, "SIDECHAT_DATABASE_URL");
  if (databaseUrl) return { kind: "postgres", databaseUrl };
  if (profile === "production") {
    throw new ServiceConfigError(
      "SIDECHAT_DATABASE_URL is required in production.",
    );
  }
  return { kind: "memory" };
};

const readServiceProfile = (rawProfile: string | undefined): ServiceProfile => {
  if (!rawProfile) return "development";
  if (rawProfile === "development" || rawProfile === "production") {
    return rawProfile;
  }
  throw new ServiceConfigError(
    "SIDECHAT_PROFILE must be development or production.",
  );
};

const readPolicyMode = (
  profile: ServiceProfile,
  rawMode: string | undefined,
): PolicyMode => {
  if (!rawMode) {
    return profile === "production" ? "fail_closed" : "allow_all";
  }
  if (
    rawMode === "allow_all" ||
    rawMode === "fail_closed" ||
    rawMode === "configured"
  ) {
    return rawMode;
  }
  throw new ServiceConfigError(
    "SIDECHAT_POLICY_MODE must be allow_all, fail_closed, or configured.",
  );
};

const readAllowedModels = (env: ServiceEnv): readonly string[] => {
  const rawModels = envValue(env, "SIDECHAT_ALLOWED_MODELS");
  if (!rawModels) return [];
  return rawModels
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
};

const normalizeBearerToken = (token: string): string =>
  token.startsWith("Bearer ") ? token : `Bearer ${token}`;

const envValue = (env: ServiceEnv, key: string): string | undefined => {
  const value = env[key]?.trim();
  return value ? value : undefined;
};
