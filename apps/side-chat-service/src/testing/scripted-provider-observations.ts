import type { ProviderScriptMode } from "./scripted-provider-contract.js";

/**
 * The scripted model runs in the host-side workflow bundle. Structured stdout
 * observations let the compatibility suite inspect that separate process
 * without leaking provider execution state through the application contract.
 */
export const PROVIDER_OBSERVATION_PREFIX = "[compatibility-observation]";

export const PROVIDER_OBSERVATION_EVENT = {
  ATTEMPT: "provider-attempt",
  STREAMING: "provider-streaming",
  WAITING: "provider-waiting",
  ABORTED: "provider-aborted",
  ERROR: "provider-error",
  CLIENT_TOOL_OUTPUT_OBSERVED: "client-tool-output-observed",
} as const;

const providerAttempts = new Map<string, number>();

export function recordProviderAttempt(
  requestId: string,
  mode: ProviderScriptMode,
  abortObserved: boolean,
): number {
  const attemptCount = (providerAttempts.get(requestId) ?? 0) + 1;
  providerAttempts.set(requestId, attemptCount);
  recordProviderObservation({
    event: PROVIDER_OBSERVATION_EVENT.ATTEMPT,
    requestId,
    mode,
    attemptCount,
    abortObserved,
  });
  return attemptCount;
}

export function recordProviderObservation(
  observation: Readonly<Record<string, unknown>>,
): void {
  console.log(`${PROVIDER_OBSERVATION_PREFIX} ${JSON.stringify(observation)}`);
}
