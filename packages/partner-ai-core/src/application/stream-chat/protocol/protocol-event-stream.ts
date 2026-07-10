import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { AiRuntimeRequest, RuntimeEvent } from "@side-chat/ai-runtime-contract";
import { Effect, Ref, Stream } from "effect";
import type { PartnerAiCoreError } from "#errors";
import { buildModelTurnRequest } from "../model-request/build-model-turn-request.js";
import {
  createProtocolEventAccumulator,
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
import {
  recordRuntimeEventObservation,
  recordStreamObservationEffect,
} from "../stream-chat-observability.js";
import type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "../stream-chat-types.js";

/**
 * Shared state for the stream and its finalizer.
 *
 * The accumulator records only events that were appended successfully. The
 * sequence and state-machine refs enforce the browser contract. Both the stream
 * and `onExit` use these same refs, so finalization sees the events that were
 * actually committed.
 *
 * Source: events accepted by the protocol state machine. Target: the stream and
 * its finalizer. Invariant: both use the same committed state.
 */
export type ProtocolStreamRefs = {
  readonly ports: StreamChatPorts;
  readonly input: StreamChatInput;
  readonly turn: PreparedStreamChatTurn;
  readonly accumulator: Ref.Ref<ProtocolEventAccumulator>;
  readonly nextProtocolSequence: Ref.Ref<number>;
  readonly streamState: Ref.Ref<ProtocolStreamState>;
};

/**
 * Allocate the per-turn state shared by the stream and its finalizer.
 *
 * Core assigns browser sequence numbers after `sidechat.started`. Runtime
 * sequence numbers are private and may include events the browser never sees.
 * The state machine prevents a second start, a second terminal, or any event
 * after a terminal.
 *
 * Source: one prepared turn. Target: the shared stream state. Invariant: browser
 * sequence numbers start after `sidechat.started` and advance only for emitted
 * events.
 */
export const createProtocolStreamRefs = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
): Effect.Effect<ProtocolStreamRefs> =>
  Effect.gen(function* () {
    // Activity retention is a config decision made here, at allocation: a
    // disabled service never holds activity payloads in memory at all.
    const collectActivity = ports.turnActivityHistory === "full";
    const accumulator = yield* Ref.make(createProtocolEventAccumulator(collectActivity));
    const nextProtocolSequence = yield* Ref.make(1);
    const streamState = yield* Ref.make(createProtocolStreamState());
    return { ports, input, turn, accumulator, nextProtocolSequence, streamState };
  });

/**
 * Build the browser-facing stream after `sidechat.started`.
 *
 * Runtime failures become one terminal protocol event, so the client always
 * sees exactly one of `completed`, `error`, or `blocked`. Durable turn status is
 * written by the runner's `onExit`, not by a stream-tail step.
 *
 * Source: the runtime event stream after the start marker. Target: browser
 * protocol events. Invariant: one terminal event closes the protocol stream.
 */
export const createStartedProtocolStream = (
  refs: ProtocolStreamRefs,
): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> => {
  // Emit the product start marker only after all pre-start persistence/context
  // work has succeeded.
  const started = Stream.fromEffect(emitStartedEvent(refs));

  // Runtime/provider failures are caught in this segment and converted to the
  // single terminal protocol error required after the stream has started.
  const runtimeEvents = createObservedRuntimeEventStream(refs);

  return Stream.concat(started, runtimeEvents);
};

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
    return started;
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
): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> => {
  const mappedEvents = Stream.mapEffect(createRuntimeEventStream(refs), (runtimeEvent) =>
    mapRuntimeEventEffect(refs, runtimeEvent),
  );
  return keepEmittedEvents(mappedEvents).pipe(
    Stream.catch((error) =>
      keepEmittedEvents(Stream.fromEffect(emitRuntimeFailureEvent(refs, error))),
    ),
  );
};

/**
 * Keep only the events the mapper chose to emit, dropping the `undefined`s.
 *
 * Both the runtime mapper and the failure mapper return `undefined` for an event
 * the browser contract forbids (a lifecycle-only runtime event, or a failure that
 * arrives after a terminal already won). Folding both through one named step keeps
 * that emit-or-drop rule in a single place instead of inline at each call site.
 */
const keepEmittedEvents = (
  stream: Stream.Stream<SidechatStreamEvent | undefined, PartnerAiCoreError>,
): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> =>
  Stream.flatMap(stream, (event) => (event ? Stream.succeed(event) : Stream.empty));

/**
 * Open the runtime stream and stop the provider when the fiber stops.
 *
 * Server-side generation has no browser abort signal. A fiber interrupt from
 * cancel, lease fencing, or shutdown must reach the provider call, not only the
 * socket. `Stream.ensuring` aborts the request on every exit: success, failure,
 * or interruption. Aborting after normal completion is harmless.
 */
const createRuntimeEventStream = (
  refs: ProtocolStreamRefs,
): Stream.Stream<RuntimeEvent, PartnerAiCoreError> => {
  const abortController = new AbortController();
  const request = abortableRuntimeRequest(refs, abortController.signal);
  return refs.ports.runtime
    .streamEffect(request)
    .pipe(
      Stream.mapError(mapUnknownRuntimeError),
      Stream.ensuring(Effect.sync(() => abortController.abort())),
    );
};

const abortableRuntimeRequest = (
  refs: ProtocolStreamRefs,
  abortSignal: AbortSignal,
): AiRuntimeRequest => ({
  ...buildModelTurnRequest(refs.input, refs.turn),
  abortSignal,
});

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
    return event;
  });

/**
 * Emit the final error event after streaming has already started.
 *
 * Before `sidechat.started`, a failure rejects the request. After it, the
 * browser needs `sidechat.error` to close the turn cleanly. A failure
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
    return event;
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
