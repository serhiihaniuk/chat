import {
  CAPABILITY_FAILURE_MODES,
  CONTEXT_ADMISSION_POLICIES,
  HISTORY_CONTEXT_MODES,
  MEMORY_AUTO_WRITE_MODES,
  MEMORY_DEFAULT_SCOPES,
  type ContextAdmissionPolicy,
  type CapabilityFailureMode,
  type HistoryContextMode,
  type MemoryAutoWriteMode,
  type MemoryDefaultScope,
} from "@side-chat/partner-ai-core";
import {
  DEFAULT_SERVICE_CAPABILITY_CONFIG,
  MEMORY_CAPABILITY_MODES,
  RAG_CAPABILITY_MODES,
  RESEARCH_CAPABILITY_MODES,
  type MemoryCapabilityMode,
  type RagCapabilityMode,
  type ResearchCapabilityMode,
  type ServiceCapabilityConfig,
} from "#composition/capabilities/service-capability-settings";
import { ServiceConfigError } from "./service-config-error.js";

type ServiceEnv = Readonly<Record<string, string | undefined>>;

export const CAPABILITY_ENV_KEYS = {
  contextAdmissionPolicy: "SIDECHAT_CONTEXT_ADMISSION_POLICY",
  contextMaxHistoryTokens: "SIDECHAT_CONTEXT_MAX_HISTORY_TOKENS",
  contextMaxInputTokens: "SIDECHAT_CONTEXT_MAX_INPUT_TOKENS",
  contextMaxMemoryTokens: "SIDECHAT_CONTEXT_MAX_MEMORY_TOKENS",
  contextMaxRagTokens: "SIDECHAT_CONTEXT_MAX_RAG_TOKENS",
  contextMaxResearchTokens: "SIDECHAT_CONTEXT_MAX_RESEARCH_TOKENS",
  contextReservedOutputTokens: "SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS",
  historyMaxMessages: "SIDECHAT_HISTORY_MAX_MESSAGES",
  historyMaxTokens: "SIDECHAT_HISTORY_MAX_TOKENS",
  historyMode: "SIDECHAT_HISTORY_MODE",
  memoryAutoWrite: "SIDECHAT_MEMORY_AUTO_WRITE",
  memoryDefaultScope: "SIDECHAT_MEMORY_DEFAULT_SCOPE",
  memoryMode: "SIDECHAT_MEMORY_MODE",
  ragFailureMode: "SIDECHAT_RAG_FAILURE_MODE",
  ragMode: "SIDECHAT_RAG_MODE",
  ragSources: "SIDECHAT_RAG_SOURCES",
  researchFailureMode: "SIDECHAT_RESEARCH_FAILURE_MODE",
  researchMode: "SIDECHAT_RESEARCH_MODE",
} as const;

/**
 * Prepare the capability declarations that must be settled before composition.
 *
 * `SIDECHAT_*` environment variables become the service capability config used
 * for manifest declarations, context budgets, health status, and port
 * selection. This parser validates operator intent only; composition remains
 * the place that chooses no-op ports or requires concrete implementations.
 */
export const createCapabilityConfigFromEnv = (env: ServiceEnv): ServiceCapabilityConfig => {
  // Prove that any declared retrieval lane has source ids before a manifest can
  // advertise RAG to core policy.
  const ragMode = readRagMode(envValue(env, CAPABILITY_ENV_KEYS.ragMode));
  const ragSourceIds = readCapabilityIdList(env, CAPABILITY_ENV_KEYS.ragSources);
  if (ragMode !== RAG_CAPABILITY_MODES.DISABLED && ragSourceIds.length === 0) {
    throw new ServiceConfigError(
      "SIDECHAT_RAG_SOURCES is required when SIDECHAT_RAG_MODE is not disabled.",
    );
  }

  // Declare memory policy shape. Storage selection is deliberately deferred so
  // local no-op boot and production adapter checks share the same config object.
  const memory = {
    mode: readMemoryMode(envValue(env, CAPABILITY_ENV_KEYS.memoryMode)),
    autoWrite: readMemoryAutoWrite(envValue(env, CAPABILITY_ENV_KEYS.memoryAutoWrite)),
    defaultScope: readMemoryDefaultScope(envValue(env, CAPABILITY_ENV_KEYS.memoryDefaultScope)),
  };

  // Declare retrieval sources. These ids become manifest policy inputs, not
  // retriever credentials or implementation details.
  const rag = {
    mode: ragMode,
    sourceIds: ragSourceIds,
    failureMode: readRagFailureMode(envValue(env, CAPABILITY_ENV_KEYS.ragFailureMode)),
  };

  // Declare the pre-answer research lane separately from retrieval so policy
  // can allow one, both, or neither in later turn planning.
  const research = {
    mode: readResearchMode(envValue(env, CAPABILITY_ENV_KEYS.researchMode)),
    failureMode: readResearchFailureMode(envValue(env, CAPABILITY_ENV_KEYS.researchFailureMode)),
  };

  // Declare history admission limits before composition chooses the
  // repository-backed context reader for implemented modes.
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

  // Validate context-window budgets last because they constrain all candidate
  // sources once deterministic admission starts trimming gathered context.
  const contextAdmission = createContextAdmissionConfig(env);

  return {
    memory,
    rag,
    research,
    history,
    contextAdmission,
  };
};

const createContextAdmissionConfig = (
  env: ServiceEnv,
): ServiceCapabilityConfig["contextAdmission"] => {
  // Admission budgets are recorded by the current include-all policy. Keeping
  // them typed now makes the later trimming phase a context-manager change, not
  // another env/config migration.
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
    maxMemoryTokens: readPositiveInt(
      env,
      CAPABILITY_ENV_KEYS.contextMaxMemoryTokens,
      DEFAULT_SERVICE_CAPABILITY_CONFIG.contextAdmission.maxMemoryTokens,
    ),
    maxRagTokens: readPositiveInt(
      env,
      CAPABILITY_ENV_KEYS.contextMaxRagTokens,
      DEFAULT_SERVICE_CAPABILITY_CONFIG.contextAdmission.maxRagTokens,
    ),
    maxResearchTokens: readPositiveInt(
      env,
      CAPABILITY_ENV_KEYS.contextMaxResearchTokens,
      DEFAULT_SERVICE_CAPABILITY_CONFIG.contextAdmission.maxResearchTokens,
    ),
  };

  if (config.reservedOutputTokens >= config.maxInputTokens) {
    throw new ServiceConfigError(
      "SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS must be lower than SIDECHAT_CONTEXT_MAX_INPUT_TOKENS.",
    );
  }

  return config;
};

const memoryModes = new Set<MemoryCapabilityMode>(Object.values(MEMORY_CAPABILITY_MODES));
const memoryAutoWriteModes = new Set<MemoryAutoWriteMode>(Object.values(MEMORY_AUTO_WRITE_MODES));
const memoryDefaultScopes = new Set<MemoryDefaultScope>(Object.values(MEMORY_DEFAULT_SCOPES));
const ragModes = new Set<RagCapabilityMode>(Object.values(RAG_CAPABILITY_MODES));
const ragFailureModes = new Set<CapabilityFailureMode>(Object.values(CAPABILITY_FAILURE_MODES));
const researchModes = new Set<ResearchCapabilityMode>(Object.values(RESEARCH_CAPABILITY_MODES));
const researchFailureModes = new Set<CapabilityFailureMode>(
  Object.values(CAPABILITY_FAILURE_MODES),
);
const historyModes = new Set<HistoryContextMode>(Object.values(HISTORY_CONTEXT_MODES));
const contextAdmissionPolicies = new Set<ContextAdmissionPolicy>(
  Object.values(CONTEXT_ADMISSION_POLICIES),
);

const readMemoryMode = (rawMode: string | undefined): MemoryCapabilityMode =>
  readEnum(rawMode, MEMORY_CAPABILITY_MODES.DISABLED, memoryModes, "SIDECHAT_MEMORY_MODE");

const readMemoryAutoWrite = (rawMode: string | undefined): MemoryAutoWriteMode =>
  readEnum(
    rawMode,
    MEMORY_AUTO_WRITE_MODES.DISABLED,
    memoryAutoWriteModes,
    "SIDECHAT_MEMORY_AUTO_WRITE",
  );

const readMemoryDefaultScope = (rawScope: string | undefined): MemoryDefaultScope =>
  readEnum(
    rawScope,
    MEMORY_DEFAULT_SCOPES.USER,
    memoryDefaultScopes,
    "SIDECHAT_MEMORY_DEFAULT_SCOPE",
  );

const readRagMode = (rawMode: string | undefined): RagCapabilityMode =>
  readEnum(rawMode, RAG_CAPABILITY_MODES.DISABLED, ragModes, "SIDECHAT_RAG_MODE");

const readRagFailureMode = (rawMode: string | undefined): CapabilityFailureMode =>
  readEnum(rawMode, CAPABILITY_FAILURE_MODES.DEGRADE, ragFailureModes, "SIDECHAT_RAG_FAILURE_MODE");

const readResearchMode = (rawMode: string | undefined): ResearchCapabilityMode =>
  readEnum(rawMode, RESEARCH_CAPABILITY_MODES.DISABLED, researchModes, "SIDECHAT_RESEARCH_MODE");

const readResearchFailureMode = (rawMode: string | undefined): CapabilityFailureMode =>
  readEnum(
    rawMode,
    CAPABILITY_FAILURE_MODES.DEGRADE,
    researchFailureModes,
    "SIDECHAT_RESEARCH_FAILURE_MODE",
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

const readCapabilityIdList = (env: ServiceEnv, key: string): readonly string[] => {
  const rawIds = envValue(env, key);
  if (!rawIds) return [];

  const ids = rawIds
    .split(",")
    .map((sourceId) => sourceId.trim())
    .filter(Boolean);
  const seenIds = new Set<string>();

  for (const id of ids) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(id)) {
      throw new ServiceConfigError(`${key} contains invalid capability id ${id}.`);
    }
    if (seenIds.has(id)) {
      throw new ServiceConfigError(`${key} contains duplicate capability id ${id}.`);
    }
    seenIds.add(id);
  }

  return ids;
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
