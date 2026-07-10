import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "@side-chat/chat-protocol";

/**
 * Protocol stream correctness enforced before each browser event is emitted.
 *
 * The accumulator validates the stream after the fact for persistence; this
 * state machine is the front-line invariant: the browser never sees a second
 * `sidechat.started`, more than one terminal, or any event after a terminal. A
 * rejected transition means "do not emit this event", which keeps the
 * `sidechat.v1` stream valid by construction.
 */

export const PROTOCOL_STREAM_STATUSES = {
  IDLE: "idle",
  STARTED: "started",
  STREAMING: "streaming",
  COMPLETED: "completed",
  FAILED: "failed",
  BLOCKED: "blocked",
} as const;

export type ProtocolStreamStatus =
  (typeof PROTOCOL_STREAM_STATUSES)[keyof typeof PROTOCOL_STREAM_STATUSES];

export type ProtocolStreamState = { readonly status: ProtocolStreamStatus };

/**
 * Result of feeding one candidate browser event to the state machine.
 *
 * `ok` carries the next state to commit before emitting; a rejection carries the
 * reason for diagnostics and means the event must be dropped, not emitted.
 */
export type ProtocolStreamTransition =
  | { readonly ok: true; readonly state: ProtocolStreamState }
  | { readonly ok: false; readonly reason: string };

const TERMINAL_STATUSES: ReadonlySet<ProtocolStreamStatus> = new Set([
  PROTOCOL_STREAM_STATUSES.COMPLETED,
  PROTOCOL_STREAM_STATUSES.FAILED,
  PROTOCOL_STREAM_STATUSES.BLOCKED,
]);

export const createProtocolStreamState = (): ProtocolStreamState => ({
  status: PROTOCOL_STREAM_STATUSES.IDLE,
});

export const isTerminalStatus = (status: ProtocolStreamStatus): boolean =>
  TERMINAL_STATUSES.has(status);

/**
 * Decide whether `event` may be emitted next, and what state follows.
 *
 * Order of checks is the contract: any event after a terminal is rejected first,
 * then `sidechat.started` is allowed only from idle, progress only after start,
 * and a terminal only after start. Anything else is an out-of-order defect.
 */
export const advanceProtocolStream = (
  state: ProtocolStreamState,
  event: SidechatStreamEvent,
): ProtocolStreamTransition => {
  if (isTerminalStatus(state.status)) {
    return reject(`Received ${event.type} after terminal ${state.status}.`);
  }
  if (event.type === SIDECHAT_EVENT_TYPES.STARTED) return advanceStarted(state);
  const terminalStatus = terminalStatusForEvent(event);
  if (terminalStatus) return advanceTerminal(state, event, terminalStatus);
  return advanceProgress(state, event);
};

const advanceStarted = (state: ProtocolStreamState): ProtocolStreamTransition =>
  state.status === PROTOCOL_STREAM_STATUSES.IDLE
    ? accept(PROTOCOL_STREAM_STATUSES.STARTED)
    : reject(`sidechat.started is only valid from idle, not ${state.status}.`);

const advanceProgress = (
  state: ProtocolStreamState,
  event: SidechatStreamEvent,
): ProtocolStreamTransition =>
  state.status === PROTOCOL_STREAM_STATUSES.IDLE
    ? reject(`Received ${event.type} before sidechat.started.`)
    : accept(PROTOCOL_STREAM_STATUSES.STREAMING);

const advanceTerminal = (
  state: ProtocolStreamState,
  event: SidechatStreamEvent,
  terminalStatus: ProtocolStreamStatus,
): ProtocolStreamTransition =>
  state.status === PROTOCOL_STREAM_STATUSES.IDLE
    ? reject(`Received ${event.type} before sidechat.started.`)
    : accept(terminalStatus);

/**
 * Map a terminal browser event to its terminal status, or `undefined` for
 * non-terminal events. The status only drives emission gating here: every
 * terminal closes the stream the same way. Durable turn outcome, including
 * whether a turn was user-aborted, is decided at finalization from the persisted
 * events, not from this status.
 */
const terminalStatusForEvent = (event: SidechatStreamEvent): ProtocolStreamStatus | undefined => {
  if (event.type === SIDECHAT_EVENT_TYPES.COMPLETED) return PROTOCOL_STREAM_STATUSES.COMPLETED;
  if (event.type === SIDECHAT_EVENT_TYPES.ERROR) return PROTOCOL_STREAM_STATUSES.FAILED;
  if (event.type === SIDECHAT_EVENT_TYPES.BLOCKED) return PROTOCOL_STREAM_STATUSES.BLOCKED;
  return undefined;
};

const accept = (status: ProtocolStreamStatus): ProtocolStreamTransition => ({
  ok: true,
  state: { status },
});

const reject = (reason: string): ProtocolStreamTransition => ({ ok: false, reason });
