import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { RuntimeEvent } from "@side-chat/ai-runtime-contract";
import { Effect, Ref, Stream } from "effect";
import type { PartnerAiCoreError } from "#errors";
import { buildModelTurnRequest } from "../model-request/build-model-turn-request.js";
import {
  createProtocolEventAccumulator,
  recordProtocolEvent,
  type ProtocolEventAccumulator,
} from "./finalization/protocol-event-accumulator.js";
import {
  advanceProtocolStream,
  createProtocolStreamState,
  type ProtocolStreamState,
} from "./protocol-stream-state-machine.js";
import {
  createErrorEvent,
  mapRuntimeEvent,
  mapUnknownRuntimeError,
} from "./runtime-event-mapper.js";
import { finalizeProtocolStream } from "./finalization/protocol-terminal-lifecycle.js";
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

    // The state machine gates emission so the browser never sees a second start,
    // a second terminal, or any event after a terminal.
    const streamState = yield* Ref.make(createProtocolStreamState());

    return createStartedProtocolStream({
      ports,
      input,
      turn,
      accumulator,
      nextProtocolSequence,
      streamState,
    });
  });

  return Stream.unwrap(protocolStream);
};

type ProtocolStreamRefs = {
  readonly ports: StreamChatPorts;
  readonly input: StreamChatInput;
  readonly turn: PreparedStreamChatTurn;
  readonly accumulator: Ref.Ref<ProtocolEventAccumulator>;
  readonly nextProtocolSequence: Ref.Ref<number>;
  readonly streamState: Ref.Ref<ProtocolStreamState>;
};

const createStartedProtocolStream = (
  refs: ProtocolStreamRefs,
): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> => {
  const { ports, input, turn, accumulator } = refs;

  // Emit the product start marker only after all pre-start persistence/context
  // work has succeeded.
  const started = Stream.fromEffect(emitStartedEvent(refs));

  // Runtime/provider failures are caught in this segment and converted to the
  // single terminal protocol error required after the stream has started.
  const runtimeEvents = createObservedRuntimeEventStream(refs);

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

const emitStartedEvent = (refs: ProtocolStreamRefs): Effect.Effect<SidechatStreamEvent> =>
  Effect.gen(function* () {
    const { ports, input, turn } = refs;
    const started: SidechatStreamEvent = {
      protocolVersion: input.request.protocolVersion,
      type: SIDECHAT_EVENT_TYPES.STARTED,
      eventId: ports.ids.nextEventId(),
      assistantTurnId: turn.assistantTurnId,
      sequence: 0,
      createdAt: ports.clock.now(),
      conversationId: turn.conversation.conversationId,
    };
    // Commit the idle -> started transition; from idle this is always accepted.
    yield* acceptStreamTransition(refs.streamState, started);
    return yield* rememberEvent(refs.accumulator, started);
  });

/**
 * Observe every runtime event before mapping it.
 *
 * Mapping can drop lifecycle-only runtime events, but observability still needs
 * to know the runtime emitted them. Runtime stream failures are caught here
 * because `sidechat.started` has already been emitted.
 */
const createObservedRuntimeEventStream = (
  refs: ProtocolStreamRefs,
): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> =>
  createRuntimeEventStream(refs).pipe(
    Stream.mapEffect((runtimeEvent) => mapRuntimeEventEffect(refs, runtimeEvent)),
    Stream.flatMap((event) => (event ? Stream.succeed(event) : Stream.empty)),
    Stream.catch((error) =>
      Stream.fromEffect(emitRuntimeFailureEvent(refs, error)).pipe(
        Stream.flatMap((event) => (event ? Stream.succeed(event) : Stream.empty)),
      ),
    ),
  );

const createRuntimeEventStream = (
  refs: ProtocolStreamRefs,
): Stream.Stream<RuntimeEvent, PartnerAiCoreError> =>
  refs.ports.runtime
    .streamEffect(buildModelTurnRequest(refs.input, refs.turn))
    .pipe(Stream.mapError(mapUnknownRuntimeError));

const mapRuntimeEventEffect = (
  refs: ProtocolStreamRefs,
  runtimeEvent: RuntimeEvent,
): Effect.Effect<SidechatStreamEvent | undefined, PartnerAiCoreError> =>
  Effect.gen(function* () {
    // Observe before mapping because some runtime lifecycle events are not
    // browser-visible but still matter for server diagnostics.
    yield* recordRuntimeEventObservation(refs.ports, refs.turn, runtimeEvent);
    const sequence = yield* Ref.get(refs.nextProtocolSequence);
    const event = mapRuntimeEvent(runtimeEvent, refs.input.request, refs.ports, sequence);
    if (!event) return undefined;

    // The state machine drops any event the browser contract forbids (a second
    // terminal, anything after a terminal) without consuming a sequence number.
    const accepted = yield* acceptStreamTransition(refs.streamState, event);
    if (!accepted) return undefined;

    // Advance protocol sequence only for events that cross the browser contract.
    yield* Ref.set(refs.nextProtocolSequence, sequence + 1);
    return yield* rememberEvent(refs.accumulator, event);
  });

/**
 * Emit the final error event after streaming has already started.
 *
 * Before `sidechat.started`, a failure rejects the request. After it, the
 * browser needs `sidechat.error` so the UI can close the turn cleanly. A failure
 * that arrives after a terminal was already emitted is dropped by the state
 * machine so the stream keeps exactly one terminal.
 */
const emitRuntimeFailureEvent = (
  refs: ProtocolStreamRefs,
  error: PartnerAiCoreError,
): Effect.Effect<SidechatStreamEvent | undefined, PartnerAiCoreError> =>
  Effect.gen(function* () {
    const { ports, input, turn } = refs;
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
    const sequence = yield* Ref.get(refs.nextProtocolSequence);
    const event = createErrorEvent(input, turn.assistantTurnId, sequence, ports, error);
    const accepted = yield* acceptStreamTransition(refs.streamState, event);
    if (!accepted) return undefined;
    return yield* rememberEvent(refs.accumulator, event);
  });

/**
 * Commit the state-machine transition for one candidate browser event.
 *
 * Returns whether the event may be emitted. A rejected transition leaves the
 * committed state unchanged so the offending event is simply dropped.
 */
const acceptStreamTransition = (
  streamState: Ref.Ref<ProtocolStreamState>,
  event: SidechatStreamEvent,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const state = yield* Ref.get(streamState);
    const transition = advanceProtocolStream(state, event);
    if (!transition.ok) return false;
    yield* Ref.set(streamState, transition.state);
    return true;
  });

const rememberEvent = (
  accumulator: Ref.Ref<ProtocolEventAccumulator>,
  event: SidechatStreamEvent,
): Effect.Effect<SidechatStreamEvent> =>
  Ref.update(accumulator, (current) => recordProtocolEvent(current, event)).pipe(Effect.as(event));
