import type {
  ContextAdmissionSelectionMode,
  ContextAdmissionConfig,
  HistoryContextConfig,
} from "@side-chat/partner-ai-core";
import {
  createContextAdmissionStatus,
  createHistoryStatus,
  createPersistenceStatus,
  CAPABILITY_STATES,
  type CapabilityState,
} from "./capability-status-builders.js";

/** Secret-safe status row exposed by `/healthz` and `/readyz`. */
export type CapabilityStatus = {
  readonly capability: string;
  readonly state: CapabilityState;
  readonly safeForProduction: boolean;
  readonly adapterId?: string;
  readonly policyId?: string;
  /** Actual context selector behavior; distinct from configured admission policy id. */
  readonly selectionMode?: ContextAdmissionSelectionMode;
  /** Secret-free context token limits recorded for health/readiness diagnostics. */
  readonly recordedBudget?: ContextAdmissionRecordedBudget;
  readonly reason?: string;
};

/**
 * Secret-free budget summary exposed by service diagnostics.
 *
 * These values come from context admission configuration and are safe for
 * readiness probes. They explain the recorded limits only; the sibling
 * `selectionMode` field says whether the current selector enforces those
 * limits or only records them.
 */
export type ContextAdmissionRecordedBudget = {
  readonly maxInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly sourceTokenBudgets: {
    readonly history: number;
  };
};

/** Health snapshot for the implemented RC capability surface. */
export type ServiceCapabilityStatus = {
  readonly history: CapabilityStatus;
  readonly contextAdmission: CapabilityStatus;
  readonly persistence: CapabilityStatus;
};

export type ServiceCapabilityStatusInput = {
  readonly history: HistoryContextConfig;
  readonly contextAdmission: ContextAdmissionConfig;
  readonly persistenceKind: "memory" | "postgres";
};

export class ServiceCapabilityConfigurationError extends Error {
  readonly code = "service_capability_misconfigured";

  constructor(message: string) {
    super(message);
    this.name = "ServiceCapabilityConfigurationError";
  }
}

export const createServiceCapabilityStatus = (
  input: ServiceCapabilityStatusInput,
): ServiceCapabilityStatus => ({
  history: createHistoryStatus(input.history),
  contextAdmission: createContextAdmissionStatus(input.contextAdmission),
  persistence: createPersistenceStatus(input.persistenceKind),
});

/**
 * Fail production boot when a model-visible capability is only declared.
 *
 * Production may expose summary history only after a concrete implementation
 * exists. Misconfigured declarations remain limited to local and test profiles,
 * before any route can accept traffic.
 */
export const assertProductionCapabilityStatus = (
  status: ServiceCapabilityStatus,
  authProfile: "development" | "production",
) => {
  if (authProfile === "development") return;

  const unsafeEnabledCapabilities = [status.history].filter(
    (capability) => capability.state === CAPABILITY_STATES.MISCONFIGURED,
  );
  if (unsafeEnabledCapabilities.length === 0) return;

  throw new ServiceCapabilityConfigurationError(
    `Production profile requires concrete adapters for enabled capabilities: ${unsafeEnabledCapabilities
      .map((capability) => capability.capability)
      .join(", ")}.`,
  );
};
