import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { RuntimeEvent } from "@side-chat/agent-runtime";
import { optionalField } from "@side-chat/shared";
import { Effect, Ref, Stream } from "effect";
import type { PartnerAiCoreError } from "#errors";
import {
  createProtocolEventAccumulator,
  recordProtocolEvent,
  type ProtocolEventAccumulator,
} from "./protocol-event-accumulator.js";
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
    // The accumulator keeps only finalization facts, never the whole event log.
    const accumulator = yield* Ref.make(createProtocolEventAccumulator());

    // Core owns browser sequence numbers after `sidechat.started`; runtime
    // sequence numbers are internal and may include dropped lifecycle events.
    const nextProtocolSequence = yield* Ref.make(1);

    return createStartedProtocolStream(ports, input, turn, accumulator, nextProtocolSequence);
  });

  return Stream.unwrap(protocolStream);
};

const createStartedProtocolStream = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  accumulator: Ref.Ref<ProtocolEventAccumulator>,
  nextProtocolSequence: Ref.Ref<number>,
): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> => {
  // Emit the product start marker only after all pre-start persistence/context
  // work has succeeded.
  const started = Stream.fromEffect(emitStartedEvent(ports, input, turn, accumulator));

  // Runtime/provider failures are caught in this segment and converted to the
  // single terminal protocol error required after the stream has started.
  const runtimeEvents = createObservedRuntimeEventStream(
    ports,
    input,
    turn,
    accumulator,
    nextProtocolSequence,
  );

  // Finalization runs after runtime exhaustion or terminal error emission and
  // persists the durable assistant-turn outcome.
  const finalized = Stream.fromEffectDrain(finalizeProtocolStream(ports, input, turn, accumulator));

  return concatProtocolStreamSegments({ started, runtimeEvents, finalized });
};

type ProtocolStreamSegments = {
  readonly started: Stream.Stream<SidechatStreamEvent, PartnerAiCoreError>;
  readonly runtimeEvents: Stream.Stream<SidechatStreamEvent, PartnerAiCoreError>;
  readonly finalized: Stream.Stream<never, PartnerAiCoreError>;
};

const concatProtocolStreamSegments = ({
  started,
  runtimeEvents,
  finalized,
}: ProtocolStreamSegments): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> =>
  Stream.concat(started, Stream.concat(runtimeEvents, finalized));

const emitStartedEvent = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  accumulator: Ref.Ref<ProtocolEventAccumulator>,
): Effect.Effect<SidechatStreamEvent> =>
  rememberEvent(accumulator, {
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
  accumulator: Ref.Ref<ProtocolEventAccumulator>,
  nextProtocolSequence: Ref.Ref<number>,
): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> =>
  createRuntimeEventStream(ports, input, turn).pipe(
    Stream.mapEffect((runtimeEvent) =>
      mapRuntimeEventEffect(ports, input, turn, accumulator, nextProtocolSequence, runtimeEvent),
    ),
    Stream.flatMap((event) => (event ? Stream.succeed(event) : Stream.empty)),
    Stream.catch((error) =>
      Stream.fromEffect(
        emitRuntimeFailureEvent(ports, input, turn, accumulator, nextProtocolSequence, error),
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
      executorId: turn.policyDecision.executorId,
      providerId: turn.policyDecision.providerId,
      modelId: turn.policyDecision.modelId,
      profileId: turn.policyDecision.profileId,
      systemInstructions: turn.policyDecision.systemInstructions,
      messages: turn.preparedContext.runtimeMessages,
      contextBoard: turn.preparedContext.contextBoard,
      availableToolNames: turn.policyDecision.allowedToolNames,
      toolScope: {
        hostAppId: input.hostAppId,
        workspaceId: turn.authContext.workspaceId,
        subjectId: turn.authContext.subject.subjectId,
        conversationId: turn.conversation.conversationId,
        assistantTurnId: turn.assistantTurnId,
        profileId: turn.policyDecision.profileId,
        allowedHostCommandNames: turn.policyDecision.allowedCommandNames,
      },
      ...optionalField("abortSignal", input.abortSignal),
    })
    .pipe(Stream.mapError(mapUnknownRuntimeError));

const mapRuntimeEventEffect = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  accumulator: Ref.Ref<ProtocolEventAccumulator>,
  nextProtocolSequence: Ref.Ref<number>,
  runtimeEvent: RuntimeEvent,
): Effect.Effect<SidechatStreamEvent | undefined, PartnerAiCoreError> =>
  Effect.gen(function* () {
    // Observe before mapping because some runtime lifecycle events are not
    // browser-visible but still matter for server diagnostics.
    yield* recordRuntimeEventObservation(ports, turn, runtimeEvent);
    const sequence = yield* Ref.get(nextProtocolSequence);
    const event = mapRuntimeEvent(runtimeEvent, input.request, ports, sequence);
    if (!event) return undefined;

    // Advance protocol sequence only for events that cross the browser contract.
    yield* Ref.set(nextProtocolSequence, sequence + 1);
    return yield* rememberEvent(accumulator, event);
  });

/**
 * Emit the final error event after streaming has already started.
 *
 * Before `sidechat.started`, a failure rejects the request. After it, the
 * browser needs `sidechat.error` so the UI can close the turn cleanly.
 */
const emitRuntimeFailureEvent = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  accumulator: Ref.Ref<ProtocolEventAccumulator>,
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
      accumulator,
      createErrorEvent(input, turn.assistantTurnId, sequence, ports, error),
    );
  });

const rememberEvent = (
  accumulator: Ref.Ref<ProtocolEventAccumulator>,
  event: SidechatStreamEvent,
): Effect.Effect<SidechatStreamEvent> =>
  Ref.update(accumulator, (current) => recordProtocolEvent(current, event)).pipe(Effect.as(event));
