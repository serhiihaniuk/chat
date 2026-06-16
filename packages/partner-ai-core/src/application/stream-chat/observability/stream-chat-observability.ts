import type { RuntimeEvent } from "@side-chat/ai-runtime-contract";
import type { Effect } from "effect";
import type { PartnerAiCoreError } from "#errors";
import { runtimeEventAttributes, recordStreamObservation } from "#services/stream-observability";
import type { ObservabilitySinkPort } from "#services/observability";
import type { PreparedStreamChatTurn, StreamChatPorts } from "../stream-chat-types.js";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "../errors/effect-failures.js";

/**
 * Record one lifecycle observation through the same typed error channel.
 *
 * A telemetry sink failure becomes a PartnerAiCoreError before
 * `sidechat.started`, or a terminal stream error after streaming begins. Sink
 * adapter errors should not escape directly into the stream-chat workflow.
 */
export const recordStreamObservationEffect = (
  sink: ObservabilitySinkPort | undefined,
  input: Parameters<typeof recordStreamObservation>[1],
): Effect.Effect<void, PartnerAiCoreError> =>
  mapPortFailure(recordStreamObservation(sink, input), STREAM_CHAT_FAILURES.OBSERVABILITY);

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
