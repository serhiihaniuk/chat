import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  type ProtocolErrorCode,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { Cause, Effect, Exit, Ref } from "effect";
import { STREAM_CHAT_FAILURES, mapPortFailure, type PartnerAiCoreError } from "#errors";
import type { AssistantTurnFailureStatus, TurnControlState } from "#ports";
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
 * Finish a server-owned turn after generation stops.
 *
 * The runner may stop normally, be cancelled, lose its lease, shut down, or
 * fail. This finalizer always tries to leave two things behind:
 *
 * - one terminal event for live subscribers;
 * - one final status for history.
 *
 * If the stream already emitted a terminal, that event wins. If it stopped
 * without one, this function adds a synthetic terminal. The event log rejects
 * appends after a terminal, and the status update only changes a running turn,
 * so races cannot create two terminals or two final statuses.
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
        // the turn-event store for subscribers before the status write fails the turn.
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
 * Add the terminal for a generation that stopped without one.
 *
 * The exit cause and the saved cancel request decide whether this was a user
 * cancel, an external stop, or a failure. The event log and status update both
 * have first-writer-wins guards, so a terminal racing this path is safe.
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
 * Choose the final status for an abnormal stop.
 *
 * A saved cancel request means the user stopped the turn. An interrupt without
 * that request means shutdown or lease fencing. Any other cause is a generation
 * failure.
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
 * The finalizer sends this fallback to the turn-event port, whose terminal
 * guard ignores it when the stream's own terminal won the interruption race.
 * Invariant: subscribers observe exactly one terminal.
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
