import type { ProviderScriptMode } from "./scripted-provider-contract.js";

import { isRecord } from "@side-chat/shared";

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
  NATIVE_APPROVAL_TOOL_EXECUTED: "native-approval-tool-executed",
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

export function recordProviderObservation(observation: Readonly<Record<string, unknown>>): void {
  console.log(`${PROVIDER_OBSERVATION_PREFIX} ${JSON.stringify(observation)}`);
}

/** Parse only the structured provider probe lines captured from a compiled test process. */
export function readProviderObservations(
  output: string,
  requestId: string,
  event: string,
): Array<Record<string, unknown>> {
  const observations: Array<Record<string, unknown>> = [];
  for (const line of output.split("\n")) {
    const markerIndex = line.indexOf(PROVIDER_OBSERVATION_PREFIX);
    if (markerIndex < 0) continue;
    const parsed = tryParseJson(line.slice(markerIndex + PROVIDER_OBSERVATION_PREFIX.length));
    if (isRecord(parsed) && parsed["requestId"] === requestId && parsed["event"] === event) {
      observations.push(parsed);
    }
  }
  return observations;
}

function tryParseJson(source: string): unknown {
  try {
    const parsed: unknown = JSON.parse(source);
    return parsed;
  } catch {
    return undefined;
  }
}
