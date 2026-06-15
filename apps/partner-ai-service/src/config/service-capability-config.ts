import {
  CONTEXT_ADMISSION_POLICIES,
  HISTORY_CONTEXT_MODES,
  type ContextAdmissionPolicy,
  type HistoryContextMode,
} from "@side-chat/partner-ai-core";
import {
  DEFAULT_SERVICE_CAPABILITY_CONFIG,
  type ServiceCapabilityConfig,
} from "#composition/capabilities/service-capability-settings";
import { ServiceConfigError } from "./service-config-error.js";

type ServiceEnv = Readonly<Record<string, string | undefined>>;

export const CAPABILITY_ENV_KEYS = {
  contextAdmissionPolicy: "SIDECHAT_CONTEXT_ADMISSION_POLICY",
  contextMaxHistoryTokens: "SIDECHAT_CONTEXT_MAX_HISTORY_TOKENS",
  contextMaxInputTokens: "SIDECHAT_CONTEXT_MAX_INPUT_TOKENS",
  contextReservedOutputTokens: "SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS",
  historyMaxMessages: "SIDECHAT_HISTORY_MAX_MESSAGES",
  historyMaxTokens: "SIDECHAT_HISTORY_MAX_TOKENS",
  historyMode: "SIDECHAT_HISTORY_MODE",
} as const;

/**
 * Prepare the implemented capability declarations before composition.
 *
 * `SIDECHAT_*` environment variables become the service capability config used
 * for context budgets, health status, and route wiring.
 */
export const createCapabilityConfigFromEnv = (env: ServiceEnv): ServiceCapabilityConfig => {
  const history = {
    mode: readHistoryMode(envValue(env, CAPABILITY_ENV_KEYS.historyMode)),
    maxMessages: readPositiveInt(
      env,
      CAPABILITY_ENV_KEYS.historyMaxMessages,
      DEFAULT_SERVICE_CAPABILITY_CONFIG.history.maxMessages,
    ),
    maxTokens: readPositiveInt(
      env,
      CAPABILITY_ENV_KEYS.historyMaxTokens,
      DEFAULT_SERVICE_CAPABILITY_CONFIG.history.maxTokens,
    ),
  };
  const contextAdmission = createContextAdmissionConfig(env);

  return { history, contextAdmission };
};

const createContextAdmissionConfig = (
  env: ServiceEnv,
): ServiceCapabilityConfig["contextAdmission"] => {
  const config = {
    policyId: readContextAdmissionPolicy(envValue(env, CAPABILITY_ENV_KEYS.contextAdmissionPolicy)),
    maxInputTokens: readPositiveInt(
      env,
      CAPABILITY_ENV_KEYS.contextMaxInputTokens,
      DEFAULT_SERVICE_CAPABILITY_CONFIG.contextAdmission.maxInputTokens,
    ),
    reservedOutputTokens: readPositiveInt(
      env,
      CAPABILITY_ENV_KEYS.contextReservedOutputTokens,
      DEFAULT_SERVICE_CAPABILITY_CONFIG.contextAdmission.reservedOutputTokens,
    ),
    maxHistoryTokens: readPositiveInt(
      env,
      CAPABILITY_ENV_KEYS.contextMaxHistoryTokens,
      DEFAULT_SERVICE_CAPABILITY_CONFIG.contextAdmission.maxHistoryTokens,
    ),
  };

  if (config.reservedOutputTokens >= config.maxInputTokens) {
    throw new ServiceConfigError(
      "SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS must be lower than SIDECHAT_CONTEXT_MAX_INPUT_TOKENS.",
    );
  }

  return config;
};

const historyModes = new Set<HistoryContextMode>(Object.values(HISTORY_CONTEXT_MODES));
const contextAdmissionPolicies = new Set<ContextAdmissionPolicy>(
  Object.values(CONTEXT_ADMISSION_POLICIES),
);

const readHistoryMode = (rawMode: string | undefined): HistoryContextMode =>
  readEnum(rawMode, HISTORY_CONTEXT_MODES.DISABLED, historyModes, "SIDECHAT_HISTORY_MODE");

const readContextAdmissionPolicy = (rawPolicy: string | undefined): ContextAdmissionPolicy =>
  readEnum(
    rawPolicy,
    CONTEXT_ADMISSION_POLICIES.DETERMINISTIC_V1,
    contextAdmissionPolicies,
    "SIDECHAT_CONTEXT_ADMISSION_POLICY",
  );

const readEnum = <Value extends string>(
  rawValue: string | undefined,
  defaultValue: Value,
  allowedValues: ReadonlySet<Value>,
  key: string,
): Value => {
  if (!rawValue) return defaultValue;
  if (allowedValues.has(rawValue as Value)) return rawValue as Value;
  throw new ServiceConfigError(`${key} must be one of ${[...allowedValues].join(", ")}.`);
};

const readPositiveInt = (env: ServiceEnv, key: string, defaultValue: number): number => {
  const rawValue = envValue(env, key);
  if (!rawValue) return defaultValue;
  if (!/^\d+$/.test(rawValue)) {
    throw new ServiceConfigError(`${key} must be a positive integer.`);
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ServiceConfigError(`${key} must be a positive integer.`);
  }
  return value;
};

const envValue = (env: ServiceEnv, key: string): string | undefined => {
  const value = env[key]?.trim();
  return value ? value : undefined;
};
