/**
 * Resolves env references declared by the human-readable service config.
 *
 * `sidechat.config.ts` owns which env keys exist and which defaults are safe.
 * This file turns those references into service boot values while keeping
 * secrets and deployment endpoints out of manifests, diagnostics, and browser
 * protocol data.
 */
import type { WorkspaceRef } from "@side-chat/partner-ai-core";
import { omitUndefinedProperties } from "@side-chat/shared";
import type { ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { PersistenceConfig } from "#composition/service-composition-types";
import { SERVICE_PROFILES } from "../catalog/config-values.js";
import {
  DEFAULT_SERVICE_PORT,
  DEFAULT_TENANT_ID,
  DEFAULT_WORKSPACE_ID,
} from "../service-config.js";
import { ServiceConfigError } from "../service-config-error.js";
import type {
  ServiceEnv,
  ServiceProfile,
  SideChatConfig,
  SideChatEnvironmentConfig,
} from "./types.js";
import type {
  SideChatBooleanEnvReference,
  SideChatNumberEnvReference,
  SideChatStringEnvReference,
} from "./env-references.js";

export const readWorkspace = (
  environment: SideChatEnvironmentConfig,
  env: ServiceEnv,
): WorkspaceRef => ({
  tenantId: readStringEnvReference(env, environment.tenantId) ?? DEFAULT_TENANT_ID,
  workspaceId: readStringEnvReference(env, environment.workspaceId) ?? DEFAULT_WORKSPACE_ID,
});

export const readServiceProfile = (rawProfile: string | undefined): ServiceProfile => {
  if (!rawProfile) return SERVICE_PROFILES.DEVELOPMENT;
  if (rawProfile === SERVICE_PROFILES.DEVELOPMENT || rawProfile === SERVICE_PROFILES.PRODUCTION) {
    return rawProfile;
  }
  throw new ServiceConfigError("SIDECHAT_PROFILE must be development or production.");
};

export const createAuthConfig = (
  profile: ServiceProfile,
  workspace: WorkspaceRef,
  rawToken: string | undefined,
): ServiceAuthConfig => {
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

export const createPersistenceConfig = (
  profile: ServiceProfile,
  env: ServiceEnv,
  databaseUrlReference: SideChatStringEnvReference,
): PersistenceConfig => {
  const databaseUrl = readStringEnvReference(env, databaseUrlReference);
  if (databaseUrl) return { kind: "postgres", databaseUrl };
  if (profile === SERVICE_PROFILES.PRODUCTION) {
    throw new ServiceConfigError("SIDECHAT_DATABASE_URL is required in production.");
  }
  return { kind: "memory" };
};

export const readSideChatConfigPort = (
  config: SideChatConfig,
  env: ServiceEnv = process.env,
): number => {
  const port = readNumberEnvReference(env, config.environment.port) ?? DEFAULT_SERVICE_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ServiceConfigError("PORT must be between 1 and 65535.");
  }
  return port;
};

export const readSideChatDemoSeedConversations = (
  config: SideChatConfig,
  env: ServiceEnv = process.env,
): boolean =>
  readBooleanEnvReference(env, config.environment.demoSeedConversations) ??
  Boolean(config.environment.demoSeedConversations.defaultValue);

export const readStringEnvReference = (
  env: ServiceEnv,
  reference: SideChatStringEnvReference,
): string | undefined => {
  const value = envValue(env, reference.key) ?? reference.defaultValue;
  if (value !== undefined) return value;
  if (!reference.required) return undefined;

  throw new ServiceConfigError(`${reference.key} is required.`);
};

export const readRequiredStringEnvReference = (
  env: ServiceEnv,
  reference: SideChatStringEnvReference,
  reason: string,
): string => {
  const value = envValue(env, reference.key) ?? reference.defaultValue;
  if (value !== undefined) return value;

  throw new ServiceConfigError(`${reference.key} is required ${reason}.`);
};

export const readNumberEnvReference = (
  env: ServiceEnv,
  reference: SideChatNumberEnvReference,
): number | undefined => {
  const rawValue = envValue(env, reference.key);
  if (!rawValue) return readMissingNumberEnvReference(reference);

  const parsed = Number(rawValue);
  if (Number.isFinite(parsed)) return parsed;

  throw new ServiceConfigError(`${reference.key} must be numeric.`);
};

export const readBooleanEnvReference = (
  env: ServiceEnv,
  reference: SideChatBooleanEnvReference,
): boolean | undefined => {
  const rawValue = envValue(env, reference.key);
  if (!rawValue) return readMissingBooleanEnvReference(reference);
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;

  throw new ServiceConfigError(`${reference.key} must be true or false.`);
};

export const envValue = (env: ServiceEnv, key: string): string | undefined => {
  const value = env[key]?.trim();
  return value ? value : undefined;
};

const readMissingNumberEnvReference = (
  reference: SideChatNumberEnvReference,
): number | undefined => {
  if (reference.defaultValue !== undefined) return reference.defaultValue;
  if (!reference.required) return undefined;

  throw new ServiceConfigError(`${reference.key} is required.`);
};

const readMissingBooleanEnvReference = (
  reference: SideChatBooleanEnvReference,
): boolean | undefined => {
  if (reference.defaultValue !== undefined) return reference.defaultValue;
  if (!reference.required) return undefined;

  throw new ServiceConfigError(`${reference.key} is required.`);
};

const normalizeBearerToken = (token: string): string =>
  token.startsWith("Bearer ") ? token : `Bearer ${token}`;
