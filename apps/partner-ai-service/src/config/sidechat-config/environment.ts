/**
 * Resolves env references declared by the human-readable service config.
 *
 * `sidechat.config.ts` owns which env keys exist and which defaults are safe.
 * This file turns those references into service boot values while keeping
 * secrets and deployment endpoints out of manifests, diagnostics, and browser
 * protocol data.
 */
import type { WorkspaceRef } from "@side-chat/partner-ai-core";
import {
  DIAGNOSTIC_LOG_LEVELS,
  omitUndefinedProperties,
  type DiagnosticLogLevel,
} from "@side-chat/shared";
import type { PostgresPoolOptions } from "@side-chat/db";
import type { ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { PersistenceConfig } from "#composition/service-composition-types";
import { LOG_FORMATS, SERVICE_PROFILES, type LogFormatValue } from "../catalog/config-values.js";
import {
  DEFAULT_SERVICE_PORT,
  DEFAULT_TENANT_ID,
  DEFAULT_WORKSPACE_ID,
} from "../env/service-env-contract.js";
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
  // The token is stored as configured; the auth verifier normalizes the `Bearer `
  // prefix at comparison time, so the config and directly-passed options share
  // one normalizer (see service-auth `normalizeBearerToken`).
  if (profile === SERVICE_PROFILES.PRODUCTION) {
    return omitUndefinedProperties({
      profile,
      workspace,
      trustedBearerToken: rawToken,
    });
  }

  return omitUndefinedProperties({
    profile,
    workspace,
    devBearerToken: rawToken,
  });
};

/** Resolved diagnostic-logging configuration for one boot. */
export type ServiceLoggingConfig = {
  readonly level: DiagnosticLogLevel;
  readonly format: LogFormatValue;
};

/**
 * Resolve the diagnostic log level and output format for this boot.
 *
 * Level defaults to `info` (the reference default); format has no static default
 * because it follows the profile — `pretty` in development, `json` in production
 * — unless `SIDECHAT_LOG_FORMAT` overrides it. Invalid values fail loud rather
 * than silently degrading, matching the config system's fail-fast posture.
 */
export const readLoggingConfig = (
  profile: ServiceProfile,
  env: ServiceEnv,
  environment: SideChatEnvironmentConfig,
): ServiceLoggingConfig => ({
  level: readLogLevel(readStringEnvReference(env, environment.logLevel)),
  format: readLogFormat(profile, readStringEnvReference(env, environment.logFormat)),
});

const readLogLevel = (raw: string | undefined): DiagnosticLogLevel => {
  if (raw === undefined) return "info";
  if ((DIAGNOSTIC_LOG_LEVELS as readonly string[]).includes(raw)) return raw as DiagnosticLogLevel;
  throw new ServiceConfigError(
    `SIDECHAT_LOG_LEVEL must be one of ${DIAGNOSTIC_LOG_LEVELS.join(", ")}.`,
  );
};

const readLogFormat = (profile: ServiceProfile, raw: string | undefined): LogFormatValue => {
  if (raw === undefined) {
    return profile === SERVICE_PROFILES.DEVELOPMENT ? LOG_FORMATS.PRETTY : LOG_FORMATS.JSON;
  }
  if (raw === LOG_FORMATS.PRETTY || raw === LOG_FORMATS.JSON) return raw;
  throw new ServiceConfigError(
    `SIDECHAT_LOG_FORMAT must be ${LOG_FORMATS.PRETTY} or ${LOG_FORMATS.JSON}.`,
  );
};

export const createPersistenceConfig = (
  profile: ServiceProfile,
  env: ServiceEnv,
  environment: SideChatEnvironmentConfig,
): PersistenceConfig => {
  const databaseUrl = readStringEnvReference(env, environment.databaseUrl);
  if (databaseUrl) {
    return omitUndefinedProperties({
      kind: "postgres" as const,
      databaseUrl,
      pool: readDatabasePoolOptions(env, environment.databasePool),
    });
  }
  if (profile === SERVICE_PROFILES.PRODUCTION) {
    throw new ServiceConfigError("SIDECHAT_DATABASE_URL is required in production.");
  }
  return { kind: "memory" };
};

/**
 * Resolve the query-pool tunables, or `undefined` when none are configured.
 *
 * Every field is optional: an absent value keeps the node-postgres default, so a
 * pool object is only attached when at least one knob is set.
 */
const readDatabasePoolOptions = (
  env: ServiceEnv,
  pool: SideChatEnvironmentConfig["databasePool"],
): PostgresPoolOptions | undefined => {
  const resolved = omitUndefinedProperties({
    max: readNumberEnvReference(env, pool.max),
    idleTimeoutMillis: readNumberEnvReference(env, pool.idleTimeoutMillis),
    connectionTimeoutMillis: readNumberEnvReference(env, pool.connectionTimeoutMillis),
    ssl: readBooleanEnvReference(env, pool.ssl),
  });
  return Object.keys(resolved).length > 0 ? resolved : undefined;
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
