import { ProtocolSequenceError } from "../errors.js";
import { isTerminalEvent, type SidechatStreamEvent } from "../events/event-union.js";

export type SequenceValidationResult = {
  readonly terminalEvent: SidechatStreamEvent;
  readonly eventCount: number;
};

/**
 * Check that a complete stream is ordered and closed.
 *
 * Events must be non-empty, sequence numbers must strictly increase, and the
 * last event must be the stream's only terminal. What counts as terminal is
 * owned by `isTerminalEvent` (completed/error/blocked) — this validator never
 * re-enumerates the terminal set, so a new terminal member cannot silently
 * diverge from the union.
 */
export const validateSidechatEventSequence = (
  events: readonly SidechatStreamEvent[],
): SequenceValidationResult => {
  if (events.length === 0) throw new ProtocolSequenceError("stream is empty");

  let previousSequence = -1;
  let terminalEvent: SidechatStreamEvent | undefined;
  for (const event of events) {
    if (event.sequence <= previousSequence) {
      throw new ProtocolSequenceError("event sequence must be strictly monotonic");
    }
    previousSequence = event.sequence;

    if (terminalEvent) {
      throw new ProtocolSequenceError("no event may appear after terminal event");
    }
    if (isTerminalEvent(event)) terminalEvent = event;
  }

  if (!terminalEvent) {
    throw new ProtocolSequenceError("stream must include exactly one terminal event");
  }

  return { terminalEvent, eventCount: events.length };
};
