import { ProtocolSequenceError } from "./errors.js";
import {
  isTerminalEvent,
  SIDECHAT_EVENT_TYPES,
  type SidechatStreamEvent,
} from "./events/event-union.js";

export type SequenceValidationResult = {
  readonly terminalEvent: SidechatStreamEvent;
  readonly eventCount: number;
};

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

  if (
    terminalEvent.type !== SIDECHAT_EVENT_TYPES.COMPLETED &&
    terminalEvent.type !== SIDECHAT_EVENT_TYPES.ERROR
  ) {
    throw new ProtocolSequenceError("terminal event type is unsupported");
  }

  return { terminalEvent, eventCount: events.length };
};
