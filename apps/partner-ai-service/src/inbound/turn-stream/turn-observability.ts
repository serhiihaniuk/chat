import {
  createRequestCorrelation,
  recordStreamObservation,
  type ObservabilityLifecycleState,
  type ObservabilitySinkPort,
} from "@side-chat/partner-ai-core";
import type { JsonObject } from "@side-chat/shared";
import { Effect } from "effect";

/**
 * Service-side recorder for the resumable-streaming lifecycle.
 *
 * The core turn workflow records the turn's own lifecycle (received/started/
 * runtime_event/terminal) through the same `ObservabilitySinkPort`. This is the
 * other half: the transport lifecycle that lives in the service — subscriber
 * attach/detach, replay served vs expired, reaper reaps, cross-instance cancel,
 * and run duration on terminal — so operators see resumable behavior across
 * instances. It reuses the established `recordStreamObservation` pattern (same
 * redaction, same correlation, same sink); it is not a new metrics framework.
 *
 * Lifecycle records are best-effort telemetry, never part of the request result:
 * every record is swallowed if the sink fails (`Effect.ignore`) so an observability
 * outage can never fault a subscriber stream, a reap sweep, or a cancel ack.
 */
export type ResumableObservation = {
  readonly sink: ObservabilitySinkPort | undefined;
  readonly lifecycleState: Extract<
    ObservabilityLifecycleState,
    | "subscriber_attached"
    | "subscriber_detached"
    | "replay_served"
    | "replay_expired"
    | "turn_reaped"
    | "turn_cancelled"
    | "run_finished"
  >;
  readonly assistantTurnId: string;
  /** Correlates with the turn's own observations; the turn's requestId when known. */
  readonly requestId: string;
  readonly now: string;
  /**
   * Optional run start instant, so terminal/finished records carry run duration.
   *
   * Omitted records report `latencyMs: 0` (the duration is meaningless for a
   * point-in-time event like an attach), present ones report `now - startedAt`.
   */
  readonly startedAt?: string | undefined;
  readonly errorCode?: string | undefined;
  /** Safe, non-secret counters/reasons (e.g. subscriber count, reap reason). */
  readonly attributes?: JsonObject | undefined;
};

/**
 * Record one resumable lifecycle observation as an Effect (sink failures ignored).
 *
 * Dispatcher and reaper code is Effect-native, so they `yield*` this directly. The
 * record never changes their control flow because the sink error channel is
 * collapsed here.
 */
export const recordResumableObservation = (
  observation: ResumableObservation,
): Effect.Effect<void> =>
  recordStreamObservation(observation.sink, {
    correlation: createRequestCorrelation({ requestId: observation.requestId }),
    lifecycleState: observation.lifecycleState,
    assistantTurnId: observation.assistantTurnId,
    startedAt: observation.startedAt ?? observation.now,
    now: observation.now,
    errorCode: observation.errorCode,
    attributes: observation.attributes ?? {},
  }).pipe(Effect.ignore);

/**
 * Fire-and-forget a resumable observation from a Promise-based route handler.
 *
 * The HTTP routes are async, not Effect, so they hand the record off without
 * awaiting it: telemetry must not add latency to a cancel ack or a stream open,
 * and a sink failure is already swallowed by {@link recordResumableObservation}.
 */
export const emitResumableObservation = (
  observation: ResumableObservation,
): void => {
  Effect.runPromise(recordResumableObservation(observation)).catch(
    () => undefined,
  );
};
