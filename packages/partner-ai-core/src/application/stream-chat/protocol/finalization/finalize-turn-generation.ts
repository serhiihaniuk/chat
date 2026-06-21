import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { Effect, Exit, type Ref } from "effect";
import type { PartnerAiCoreError } from "#errors";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "../../errors/effect-failures.js";
import { finalizeProtocolStream } from "./protocol-terminal-lifecycle.js";
import type { ProtocolEventAccumulator } from "./protocol-event-accumulator.js";
import type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "../../stream-chat-types.js";

/**
 * Public message carried by the synthetic terminal an abnormal exit appends.
 *
 * The browser sees this when generation ended without its own terminal: a user
 * cancel, a fiber interrupt, a shutdown, or a defect in the drain. It is the
 * one terminal those paths produce, so a reconnect can close the turn cleanly.
 */
const ABORTED_TERMINAL_MESSAGE = "The assistant turn was stopped before it finished.";

/**
 * Finalize one server-owned generation regardless of how its fiber exited.
 *
 * This is the `onExit` finalizer for the service runner. The runner forks
 * generation off the HTTP request and drains the post-start stream into the
 * event log; this function then guarantees the turn always reaches exactly one
 * durable terminal:
 *
 * - A normal exit means the post-start stream emitted its own terminal
 *   (`completed`/`error`/`blocked`) and the drain already appended it, so we only
 *   write the durable assistant-turn status from the accumulator.
 * - An abnormal exit (interrupt, shutdown, defect, or an event-log write failure)
 *   left no terminal, so we append a synthetic `sidechat.error(aborted)` at
 *   `maxSequence + 1` and record the turn as `user_aborted`.
 *
 * The synthetic append is guarded by the partial-unique terminal index
 * (`ON CONFLICT DO NOTHING` in the adapter), so even a terminal that landed
 * concurrently can never be duplicated. The durable status write rides the
 * existing running-guard, so only the first transition wins.
 */
export const finalizeTurnGeneration = <A>(
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  accumulator: Ref.Ref<ProtocolEventAccumulator>,
  exit: Exit.Exit<A, PartnerAiCoreError>,
): Effect.Effect<void, PartnerAiCoreError> =>
  Exit.isSuccess(exit)
    ? finalizeProtocolStream(ports, input, turn, accumulator)
    : finalizeAbortedTurnGeneration(ports, input, turn);

/**
 * Finalize a generation that ended without emitting its own terminal.
 *
 * The synthetic terminal append conflicts on the partial-unique terminal index,
 * so it can never duplicate a terminal that landed concurrently. The durable
 * status transition rides the running-guard, so only the first transition wins.
 * Both steps are therefore safe even though this path owns the abnormal exit.
 */
const finalizeAbortedTurnGeneration = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
): Effect.Effect<void, PartnerAiCoreError> =>
  Effect.gen(function* () {
    // Append the one terminal the abnormal path owns, after any events the drain
    // already wrote, so a reconnecting browser still closes the turn.
    yield* appendSyntheticAbortedTerminal(ports, input, turn);

    // Record the durable failure as a user abort: an interrupt is a cancel, and
    // for any other abnormal exit the browser already saw an aborted terminal.
    yield* mapPortFailure(
      ports.assistantTurns.failAssistantTurn({
        authContext: turn.authContext,
        assistantTurnId: turn.assistantTurnId,
        status: "user_aborted",
        errorCode: PROTOCOL_ERROR_CODES.ABORTED,
        now: ports.clock.now(),
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );
  });

/**
 * Append the synthetic aborted terminal at `maxSequence + 1`.
 *
 * The append goes through the event-log port, which `ON CONFLICT DO NOTHING`s on
 * the partial-unique terminal index. So if a real terminal already landed (a
 * race between the stream emitting one and the fiber being interrupted), this is
 * a durable no-op and the turn keeps exactly one terminal.
 */
const appendSyntheticAbortedTerminal = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
): Effect.Effect<void, PartnerAiCoreError> =>
  Effect.gen(function* () {
    const maxSequence = yield* mapPortFailure(
      ports.turnEventLog.maxSequence({
        authContext: turn.authContext,
        assistantTurnId: turn.assistantTurnId,
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );

    const terminal = createAbortedTerminalEvent(ports, input, turn, (maxSequence ?? -1) + 1);
    yield* mapPortFailure(
      ports.turnEventLog.appendEvent({
        authContext: turn.authContext,
        assistantTurnId: turn.assistantTurnId,
        event: terminal,
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );
  });

const createAbortedTerminalEvent = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  sequence: number,
): SidechatStreamEvent => ({
  protocolVersion: input.request.protocolVersion,
  type: SIDECHAT_EVENT_TYPES.ERROR,
  eventId: ports.ids.nextEventId(),
  assistantTurnId: turn.assistantTurnId,
  sequence,
  createdAt: ports.clock.now(),
  code: PROTOCOL_ERROR_CODES.ABORTED,
  message: ABORTED_TERMINAL_MESSAGE,
  retryable: false,
});
