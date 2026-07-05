import type { RuntimeEvent } from "@side-chat/ai-runtime-contract";
import { Effect } from "effect";
import {
  runtimeEventAttributes,
  recordStreamObservation,
  type ObservabilitySinkPort,
} from "#services/observability";
import type { PreparedStreamChatTurn, StreamChatPorts } from "./stream-chat-types.js";

/**
 * Record one lifecycle observation, fail-open.
 *
 * Telemetry must never affect a turn. This runs at pre-start and on every runtime
 * event, so a sink that rejects — a flaky adopter seam — would otherwise reject
 * the request before `sidechat.started` or abort a healthy generation mid-stream.
 * Swallowing the failure is the guarantee the `ObservabilitySinkPort` contract
 * promises; the shipped console sink already redacts and try/catches internally.
 */
export const recordStreamObservationEffect = (
  sink: ObservabilitySinkPort | undefined,
  input: Parameters<typeof recordStreamObservation>[1],
): Effect.Effect<void> => recordStreamObservation(sink, input).pipe(Effect.ignore);

/**
 * Record safe telemetry attributes for one runtime event.
 *
 * A runtime event becomes a telemetry record without model prompts, model
 * output, or tool payloads. `runtimeEventAttributes` strips those values before
 * telemetry is written.
 */
export const recordRuntimeEventObservation = (
  ports: StreamChatPorts,
  turn: PreparedStreamChatTurn,
  runtimeEvent: RuntimeEvent,
): Effect.Effect<void> =>
  recordStreamObservationEffect(ports.observability, {
    correlation: turn.correlation,
    lifecycleState: "runtime_event",
    assistantTurnId: turn.assistantTurnId,
    providerId: turn.policyDecision.providerId,
    modelId: turn.policyDecision.modelId,
    startedAt: turn.startedAt,
    now: ports.clock.now(),
    attributes: runtimeEventAttributes(runtimeEvent),
  });
