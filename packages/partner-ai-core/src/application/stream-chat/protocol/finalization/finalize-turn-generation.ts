import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  type ProtocolErrorCode,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { Cause, Effect, Exit, Ref } from "effect";
import type { PartnerAiCoreError } from "#errors";
import type { AssistantTurnFailureStatus, TurnControlState } from "#ports";
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
 * cancel, a shutdown/fence interrupt, or a defect in the drain. It is deliberately
 * neutral across those abnormal causes — the machine-readable `code` carries the
 * distinction, while this stable message stays the contract a reconnecting client
 * renders.
 */
const ABORTED_TERMINAL_MESSAGE = "The assistant turn was stopped before it finished.";

/**
 * How one abnormal exit is terminalized: the durable failure status plus the
 * protocol code stamped on both the synthetic terminal event and the turn record.
 */
type AbnormalTerminal = {
  readonly status: AssistantTurnFailureStatus;
  readonly code: ProtocolErrorCode;
};

/**
 * Finalize one server-owned generation regardless of how its fiber exited.
 *
 * This is the `onExit` finalizer for the service runner. The runner forks
 * generation off the HTTP request and drains the post-start stream into the
 * event log; this function then guarantees the turn always reaches exactly one
 * durable terminal — as a STATUS and as an EVENT:
 *
 * - A normal exit with a terminal in the accumulator persists the status the
 *   stream's own terminal dictates.
 * - A normal exit WITHOUT a terminal (a provider stream that just ended) first
 *   appends the synthetic terminal, so tailing subscribers close instead of
 *   hanging on `takeUntil`; the accumulator validation then fails the status
 *   honestly.
 * - An abnormal exit whose accumulator already holds a terminal means the
 *   stream finished and the interrupt landed after it: the stream's terminal
 *   wins — a turn the user watched complete is persisted as completed, never
 *   re-terminalized as aborted.
 * - Any other abnormal exit (interrupt, shutdown, defect, or an event-log write
 *   failure) is classified honestly from the exit cause plus the durable cancel
 *   intent, and the one synthetic terminal that path owns is appended.
 *
 * The synthetic append can never duplicate a terminal that landed concurrently:
 * the event-log adapter refuses appends after a terminal (the in-memory
 * registry's terminal guard; formerly the DB's partial-unique index). The
 * durable status write rides the running-guard, so only the first transition
 * wins.
 */
export const finalizeTurnGeneration = <A>(
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  accumulator: Ref.Ref<ProtocolEventAccumulator>,
  exit: Exit.Exit<A, PartnerAiCoreError>,
): Effect.Effect<void, PartnerAiCoreError> =>
  Effect.gen(function* () {
    const state = yield* Ref.get(accumulator);
    if (Exit.isSuccess(exit)) {
      if (!state.terminalEvent) {
        // The drain ended cleanly but the stream never carried a terminal: close
        // the event log for subscribers before the status write fails the turn.
        yield* appendSyntheticTerminal(ports, input, turn, PROTOCOL_ERROR_CODES.PROVIDER_FAILED);
      }
      return yield* finalizeProtocolStream(ports, input, turn, accumulator);
    }
    if (state.terminalEvent) {
      // Interrupt after the stream's own terminal: completed (or the stream's
      // error/blocked) beats the late interrupt, and the assistant message the
      // user watched arrive is persisted.
      return yield* finalizeProtocolStream(ports, input, turn, accumulator);
    }
    return yield* finalizeAbortedTurnGeneration(ports, input, turn, exit.cause);
  });

/**
 * Finalize a generation that ended without emitting its own terminal.
 *
 * The exit cause and the durable cancel intent decide the honest terminal: a
 * user cancel, an external interrupt (shutdown/fence), or a defect each map to a
 * different status and code. The synthetic terminal append conflicts on the
 * partial-unique terminal index, so it can never duplicate a terminal that landed
 * concurrently; the durable status write is guarded so only the first transition
 * wins. Both steps are therefore safe even though this path owns the abnormal exit.
 */
const finalizeAbortedTurnGeneration = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  cause: Cause.Cause<PartnerAiCoreError>,
): Effect.Effect<void, PartnerAiCoreError> =>
  Effect.gen(function* () {
    // Read the durable control state first: it tells us whether a cancel was
    // actually requested (interrupt classification) and whether a real terminal
    // already won the running-guard (so we skip the status write).
    const controlState = yield* readTurnControlState(ports, turn);
    const terminal = classifyAbnormalTerminal(cause, controlState);

    // Append the one terminal the abnormal path owns, after any events the drain
    // already wrote, so a reconnecting browser still closes the turn.
    yield* appendSyntheticTerminal(ports, input, turn, terminal.code);

    // Record the durable failure only while the turn is still running. Once a
    // real terminal has transitioned the status, the running-guard would reject
    // this write, so skipping keeps the invariant of exactly one status change.
    if (isStillRunning(controlState)) {
      yield* failTurn(ports, turn, terminal);
    }
  });

/**
 * Classify an abnormal exit into its honest durable terminal.
 *
 * - Interrupt with durable cancel intent: a real user cancel -> `user_aborted`.
 * - Interrupt without cancel intent: a shutdown or lease-fence stop the user did
 *   not ask for -> `provider_failed` with a timeout-style code, since generation
 *   was cut off rather than failing on its own.
 * - Any non-interrupt abnormal exit (a defect or an event-log append failure) ->
 *   `provider_failed`, the closest terminal for generation that could not finish.
 */
const classifyAbnormalTerminal = (
  cause: Cause.Cause<PartnerAiCoreError>,
  controlState: TurnControlState | undefined,
): AbnormalTerminal => {
  if (!Cause.hasInterrupts(cause)) {
    return { status: "provider_failed", code: PROTOCOL_ERROR_CODES.PROVIDER_FAILED };
  }
  if (controlState?.cancelRequested) {
    return { status: "user_aborted", code: PROTOCOL_ERROR_CODES.ABORTED };
  }
  return { status: "provider_failed", code: PROTOCOL_ERROR_CODES.TIMEOUT };
};

const isStillRunning = (controlState: TurnControlState | undefined): boolean =>
  // A missing read defaults to attempting the write: the repository running-guard
  // is the hard backstop, so a transient read miss never strands the turn.
  controlState === undefined || controlState.status === "running";

const readTurnControlState = (
  ports: StreamChatPorts,
  turn: PreparedStreamChatTurn,
): Effect.Effect<TurnControlState | undefined, PartnerAiCoreError> =>
  mapPortFailure(
    ports.assistantTurns.readTurnControlState({
      authContext: turn.authContext,
      assistantTurnId: turn.assistantTurnId,
    }),
    STREAM_CHAT_FAILURES.PERSISTENCE,
  );

const failTurn = (
  ports: StreamChatPorts,
  turn: PreparedStreamChatTurn,
  terminal: AbnormalTerminal,
): Effect.Effect<void, PartnerAiCoreError> =>
  mapPortFailure(
    ports.assistantTurns.failAssistantTurn({
      authContext: turn.authContext,
      assistantTurnId: turn.assistantTurnId,
      status: terminal.status,
      errorCode: terminal.code,
      now: ports.clock.now(),
    }),
    STREAM_CHAT_FAILURES.PERSISTENCE,
  );

/**
 * Append the synthetic terminal at `maxSequence + 1`.
 *
 * The append goes through the event-log port, which `ON CONFLICT DO NOTHING`s on
 * the partial-unique terminal index. So if a real terminal already landed (a
 * race between the stream emitting one and the fiber being interrupted), this is
 * a durable no-op and the turn keeps exactly one terminal.
 */
const appendSyntheticTerminal = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  code: ProtocolErrorCode,
): Effect.Effect<void, PartnerAiCoreError> =>
  Effect.gen(function* () {
    const maxSequence = yield* mapPortFailure(
      ports.turnEventLog.maxSequence({
        authContext: turn.authContext,
        assistantTurnId: turn.assistantTurnId,
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );

    const terminal = createAbortedTerminalEvent(ports, input, turn, (maxSequence ?? -1) + 1, code);
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
  code: ProtocolErrorCode,
): SidechatStreamEvent => ({
  protocolVersion: input.request.protocolVersion,
  type: SIDECHAT_EVENT_TYPES.ERROR,
  eventId: ports.ids.nextEventId(),
  assistantTurnId: turn.assistantTurnId,
  sequence,
  createdAt: ports.clock.now(),
  code,
  message: ABORTED_TERMINAL_MESSAGE,
  retryable: false,
});
