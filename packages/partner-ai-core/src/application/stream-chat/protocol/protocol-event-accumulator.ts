import {
  SIDECHAT_EVENT_TYPES,
  type CompletedEvent,
  type ProtocolErrorCode,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { optionalField } from "@side-chat/shared";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
} from "#errors";

type ProtocolTerminalEvent = Extract<
  SidechatStreamEvent,
  { readonly type: typeof SIDECHAT_EVENT_TYPES.COMPLETED | typeof SIDECHAT_EVENT_TYPES.ERROR }
>;

export type ProtocolEventAccumulator = {
  readonly eventCount: number;
  readonly terminalCount: number;
  readonly terminalEvent?: ProtocolTerminalEvent;
  readonly completedEvent?: CompletedEvent;
  readonly assistantContent: string;
  readonly invalidReason?: string;
};

export const createProtocolEventAccumulator = (): ProtocolEventAccumulator => ({
  eventCount: 0,
  terminalCount: 0,
  assistantContent: "",
});

export const recordProtocolEvent = (
  accumulator: ProtocolEventAccumulator,
  event: SidechatStreamEvent,
): ProtocolEventAccumulator => {
  const terminalEvent = isTerminalEvent(event) ? event : accumulator.terminalEvent;
  const completedEvent = isCompletedEvent(event) ? event : accumulator.completedEvent;
  const invalidReason = accumulator.invalidReason ?? invalidReasonForNextEvent(accumulator, event);

  return {
    eventCount: accumulator.eventCount + 1,
    terminalCount: accumulator.terminalCount + (isTerminalEvent(event) ? 1 : 0),
    ...optionalField("terminalEvent", terminalEvent),
    ...optionalField("completedEvent", completedEvent),
    assistantContent: appendAssistantContent(accumulator.assistantContent, event),
    ...optionalField("invalidReason", invalidReason),
  };
};

/**
 * Check the events collected for one browser stream.
 *
 * Sequence numbers must be contiguous, and completed/error must appear exactly
 * once as the final event.
 */
export const validateProtocolAccumulator = (accumulator: ProtocolEventAccumulator): void => {
  const reason =
    accumulator.invalidReason ??
    terminalCountIssue(accumulator) ??
    terminalPositionIssue(accumulator);

  if (reason) throw invalidRuntimeSequence(reason);
};

export const protocolTerminalErrorCode = (
  accumulator: ProtocolEventAccumulator,
): ProtocolErrorCode | undefined =>
  accumulator.terminalEvent?.type === SIDECHAT_EVENT_TYPES.ERROR
    ? accumulator.terminalEvent.code
    : undefined;

const invalidReasonForNextEvent = (
  accumulator: ProtocolEventAccumulator,
  event: SidechatStreamEvent,
): string | undefined =>
  sequenceIssue(accumulator, event) ?? eventAfterTerminalIssue(accumulator, event);

const sequenceIssue = (
  accumulator: ProtocolEventAccumulator,
  event: SidechatStreamEvent,
): string | undefined =>
  event.sequence === accumulator.eventCount
    ? undefined
    : `Expected sidechat sequence ${accumulator.eventCount} but received ${event.sequence}.`;

const eventAfterTerminalIssue = (
  accumulator: ProtocolEventAccumulator,
  event: SidechatStreamEvent,
): string | undefined =>
  accumulator.terminalEvent && !isTerminalEvent(event)
    ? `Received ${event.type} after terminal ${accumulator.terminalEvent.type}.`
    : undefined;

const terminalCountIssue = (accumulator: ProtocolEventAccumulator): string | undefined => {
  if (accumulator.terminalCount === 1) return undefined;
  return `Expected exactly one terminal event but received ${accumulator.terminalCount}.`;
};

const terminalPositionIssue = (accumulator: ProtocolEventAccumulator): string | undefined =>
  accumulator.terminalEvent ? undefined : "Stream completed without a terminal event.";

const appendAssistantContent = (content: string, event: SidechatStreamEvent): string =>
  event.type === SIDECHAT_EVENT_TYPES.DELTA ? `${content}${event.content}` : content;

const isCompletedEvent = (event: SidechatStreamEvent): event is CompletedEvent =>
  event.type === SIDECHAT_EVENT_TYPES.COMPLETED;

const isTerminalEvent = (event: SidechatStreamEvent): event is ProtocolTerminalEvent =>
  event.type === SIDECHAT_EVENT_TYPES.COMPLETED || event.type === SIDECHAT_EVENT_TYPES.ERROR;

const invalidRuntimeSequence = (message: string): PartnerAiCoreError =>
  new PartnerAiCoreError(
    PARTNER_AI_CORE_ERROR_CODES.INVALID_RUNTIME_SEQUENCE,
    message,
    PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.MALFORMED_STREAM,
  );
