import type {
  ContextAdmissionSelectionMode,
  ContextAdmissionConfig,
  HistoryContextConfig,
} from "@side-chat/partner-ai-core";
import {
  createContextAdmissionStatus,
  createHistoryStatus,
  createPersistenceStatus,
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

export const createServiceCapabilityStatus = (
  input: ServiceCapabilityStatusInput,
): ServiceCapabilityStatus => ({
  history: createHistoryStatus(input.history),
  contextAdmission: createContextAdmissionStatus(input.contextAdmission),
  persistence: createPersistenceStatus(input.persistenceKind),
});
