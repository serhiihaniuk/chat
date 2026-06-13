import type { Effect } from "effect";
import type { PartnerAiCoreError } from "#errors";
import { runtimeEventAttributes, recordStreamObservation } from "#services/stream-observability";
import type { RuntimeEvent } from "#ports";
import type { ObservabilitySinkPort } from "#services/observability";
import type { PreparedStreamChatTurn, StreamChatPorts } from "../stream-chat-types.js";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "../errors/effect-failures.js";

/**
 * Record one lifecycle observation through the same typed error channel.
 *
 * Invariant: observability should not throw arbitrary adapter errors into the workflow.
 * If a telemetry sink fails, core turns that into a PartnerAiCoreError before
 * `sidechat.started`, or into a terminal stream error after streaming begins.
 */
export const recordStreamObservationEffect = (
  sink: ObservabilitySinkPort | undefined,
  input: Parameters<typeof recordStreamObservation>[1],
): Effect.Effect<void, PartnerAiCoreError> =>
  mapPortFailure(recordStreamObservation(sink, input), STREAM_CHAT_FAILURES.OBSERVABILITY);

/**
 * Convert runtime events into safe observability attributes.
 *
 * Source runtime events can contain prompts, provider output, tool input, or tool
 * results. The lower-level stream-observability service redacts those fields
 * before records leave core.
 */
export const recordRuntimeEventObservation = (
  ports: StreamChatPorts,
  turn: PreparedStreamChatTurn,
  runtimeEvent: RuntimeEvent,
): Effect.Effect<void, PartnerAiCoreError> =>
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
