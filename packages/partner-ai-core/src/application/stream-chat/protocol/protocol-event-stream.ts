import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import { Effect, Ref, Stream } from "effect";
import type { RuntimeEvent } from "#ports";
import type { PartnerAiCoreError } from "#errors";
import {
  createErrorEvent,
  mapRuntimeEvent,
  mapUnknownRuntimeError,
} from "./runtime-event-mapper.js";
import { finalizeProtocolStream } from "./protocol-terminal-lifecycle.js";
import {
  recordRuntimeEventObservation,
  recordStreamObservationEffect,
} from "../observability/stream-chat-observability.js";
import type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "../stream-chat-types.js";

/**
 * Build the browser-facing stream after preflight work has succeeded.
 *
 * From this point on, runtime failures become terminal protocol events. That
 * keeps the SSE contract stable: once `sidechat.started` is emitted, consumers
 * should finish with exactly one `sidechat.completed` or `sidechat.error`.
 */
export const createProtocolEventStream = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> => {
  const protocolStream = Effect.gen(function* () {
    const emitted = yield* Ref.make<SidechatStreamEvent[]>([]);
    const nextProtocolSequence = yield* Ref.make(1);

    return createStartedProtocolStream(ports, input, turn, emitted, nextProtocolSequence);
  });

  return Stream.unwrap(protocolStream);
};

const createStartedProtocolStream = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  emitted: Ref.Ref<SidechatStreamEvent[]>,
  nextProtocolSequence: Ref.Ref<number>,
): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> => {
  const started = Stream.fromEffect(emitStartedEvent(ports, input, turn, emitted));
  const runtimeEvents = createObservedRuntimeEventStream(
    ports,
    input,
    turn,
    emitted,
    nextProtocolSequence,
  );
  const finalized = Stream.fromEffectDrain(finalizeProtocolStream(ports, input, turn, emitted));

  return Stream.concat(started, Stream.concat(runtimeEvents, finalized));
};

const emitStartedEvent = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  emitted: Ref.Ref<SidechatStreamEvent[]>,
): Effect.Effect<SidechatStreamEvent> =>
  rememberEvent(emitted, {
    protocolVersion: input.request.protocolVersion,
    type: SIDECHAT_EVENT_TYPES.STARTED,
    eventId: ports.ids.nextEventId(),
    assistantTurnId: turn.assistantTurnId,
    sequence: 0,
    createdAt: ports.clock.now(),
    conversationId: turn.conversation.conversationId,
  });

/**
 * Observe every runtime event before mapping it.
 *
 * Mapping can drop lifecycle-only runtime events, but observability still needs
 * to know the runtime emitted them. Runtime stream failures are caught here
 * because `sidechat.started` has already been emitted.
 */
const createObservedRuntimeEventStream = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  emitted: Ref.Ref<SidechatStreamEvent[]>,
  nextProtocolSequence: Ref.Ref<number>,
): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> =>
  createRuntimeEventStream(ports, input, turn).pipe(
    Stream.mapEffect((runtimeEvent) =>
      mapRuntimeEventEffect(ports, input, turn, emitted, nextProtocolSequence, runtimeEvent),
    ),
    Stream.flatMap((event) => (event ? Stream.succeed(event) : Stream.empty)),
    Stream.catch((error) =>
      Stream.fromEffect(
        emitRuntimeFailureEvent(ports, input, turn, emitted, nextProtocolSequence, error),
      ),
    ),
  );

const createRuntimeEventStream = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
): Stream.Stream<RuntimeEvent, PartnerAiCoreError> =>
  ports.runtime
    .streamEffect({
      requestId: input.request.requestId,
      assistantTurnId: turn.assistantTurnId,
      providerId: turn.policyDecision.providerId,
      modelId: turn.policyDecision.modelId,
      profileId: turn.policyDecision.profileId,
      messages: turn.preparedContext.runtimeMessages,
      contextBoard: turn.preparedContext.contextBoard,
      availableToolNames: turn.policyDecision.allowedToolNames,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    })
    .pipe(Stream.mapError(mapUnknownRuntimeError));

const mapRuntimeEventEffect = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  emitted: Ref.Ref<SidechatStreamEvent[]>,
  nextProtocolSequence: Ref.Ref<number>,
  runtimeEvent: RuntimeEvent,
): Effect.Effect<SidechatStreamEvent | undefined, PartnerAiCoreError> =>
  Effect.gen(function* () {
    yield* recordRuntimeEventObservation(ports, turn, runtimeEvent);
    const sequence = yield* Ref.get(nextProtocolSequence);
    const event = mapRuntimeEvent(runtimeEvent, input.request, ports, sequence);
    if (!event) return undefined;

    yield* Ref.set(nextProtocolSequence, sequence + 1);
    return yield* rememberEvent(emitted, event);
  });

/**
 * Convert a runtime failure into the stream's terminal protocol event.
 *
 * Source failures before streaming reject the request. After streaming starts,
 * the browser needs a final `sidechat.error` event so SSE consumers can close
 * the turn without seeing a broken transport as the product state.
 */
const emitRuntimeFailureEvent = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  emitted: Ref.Ref<SidechatStreamEvent[]>,
  nextProtocolSequence: Ref.Ref<number>,
  error: PartnerAiCoreError,
): Effect.Effect<SidechatStreamEvent, PartnerAiCoreError> =>
  Effect.gen(function* () {
    yield* recordStreamObservationEffect(ports.observability, {
      correlation: turn.correlation,
      lifecycleState: "failed",
      assistantTurnId: turn.assistantTurnId,
      providerId: turn.policyDecision.providerId,
      modelId: turn.policyDecision.modelId,
      errorCode: error.protocolCode,
      startedAt: turn.startedAt,
      now: ports.clock.now(),
      attributes: {
        errorCode: error.protocolCode,
        message: error.message,
      },
    });
    const sequence = yield* Ref.get(nextProtocolSequence);
    return yield* rememberEvent(
      emitted,
      createErrorEvent(input, turn.assistantTurnId, sequence, ports, error),
    );
  });

const rememberEvent = (
  emitted: Ref.Ref<SidechatStreamEvent[]>,
  event: SidechatStreamEvent,
): Effect.Effect<SidechatStreamEvent> =>
  Ref.update(emitted, (events) => [...events, event]).pipe(Effect.as(event));
