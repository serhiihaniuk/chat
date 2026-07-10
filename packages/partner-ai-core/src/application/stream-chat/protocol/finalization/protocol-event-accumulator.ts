import {
  isTerminalEvent,
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  type ActivityEvent,
  type CompletedEvent,
  type ProtocolErrorCode,
  type SidechatBlockedReason,
  type SidechatStreamEvent,
  type TerminalEvent,
} from "@side-chat/chat-protocol";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
} from "#errors";
import type { AssistantTurnFailureStatus } from "#ports";

/**
 * Finalization facts collected while core emits one browser protocol stream.
 *
 * The accumulator preserves only what durable turn finalization needs: event counts,
 * terminal identity, completed usage, accumulated assistant text, and the first
 * protocol-ordering problem. Deltas are never retained event-by-event, so
 * finalization can validate the stream without turning diagnostics into a
 * private content log. Activity events are the one config-gated exception:
 * when turn-activity history is enabled (`collectActivity`), they are retained
 * verbatim — bounded by {@link MAX_ACCUMULATED_ACTIVITY_EVENTS} — so completion
 * can persist the thinking trace alongside the answer. Disabled means disabled
 * in memory too: nothing activity-shaped is retained at all.
 */

/** Bound on retained activity events; the tool loop's step cap keeps real turns far below it. */
export const MAX_ACCUMULATED_ACTIVITY_EVENTS = 128;

/**
 * Minimal mutable summary of emitted `sidechat.v1` events.
 *
 * `assistantContent` is the only accumulated model text because successful turn
 * persistence needs the final answer. Invalid ordering is stored as the first
 * reason so later events cannot hide the original protocol violation.
 */
export type ProtocolEventAccumulator = {
  readonly eventCount: number;
  readonly terminalCount: number;
  readonly terminalEvent?: TerminalEvent | undefined;
  readonly completedEvent?: CompletedEvent | undefined;
  readonly assistantContent: string;
  readonly collectActivity: boolean;
  readonly activityEvents: readonly ActivityEvent[];
  readonly invalidReason?: string | undefined;
};

/** Initial accumulator before `sidechat.started` is successfully appended. */
export const createProtocolEventAccumulator = (
  collectActivity = false,
): ProtocolEventAccumulator => ({
  eventCount: 0,
  terminalCount: 0,
  assistantContent: "",
  collectActivity,
  activityEvents: [],
});

/**
 * Record one successfully appended browser-visible event for finalization.
 *
 * Runtime sequence ids are not used here. The accumulator checks the
 * browser-facing sequence that core assigns after `sidechat.started`.
 */
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
    terminalEvent,
    completedEvent,
    assistantContent: appendAssistantContent(accumulator.assistantContent, event),
    collectActivity: accumulator.collectActivity,
    activityEvents: appendActivityEvent(accumulator, event),
    invalidReason,
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

/** The durable persistence a failing terminal dictates: honest status + code. */
export type ProtocolTerminalFailure = {
  readonly status: AssistantTurnFailureStatus;
  readonly errorCode: ProtocolErrorCode | SidechatBlockedReason;
};

/**
 * Map the terminal event to its durable failure, or `undefined` for a
 * successful completion.
 *
 * A blocked (safety-filtered) terminal is a failed turn, not a completion — it
 * persists as status `blocked` with the blocked reason as its error code, so a
 * safety stop is auditable as distinct from a provider outage while a filtered
 * turn is still never saved as a finished answer.
 */
export const protocolTerminalFailure = (
  accumulator: ProtocolEventAccumulator,
): ProtocolTerminalFailure | undefined => {
  const terminal = accumulator.terminalEvent;
  if (terminal?.type === SIDECHAT_EVENT_TYPES.ERROR) {
    return { status: failureStatusForProtocolCode(terminal.code), errorCode: terminal.code };
  }
  if (terminal?.type === SIDECHAT_EVENT_TYPES.BLOCKED) {
    return { status: "blocked", errorCode: terminal.reason };
  }
  return undefined;
};

const failureStatusForProtocolCode = (code: ProtocolErrorCode): AssistantTurnFailureStatus => {
  if (code === PROTOCOL_ERROR_CODES.ABORTED) return "user_aborted";
  if (code === PROTOCOL_ERROR_CODES.TIMEOUT) return "timed_out";
  if (code === PROTOCOL_ERROR_CODES.TOOL_FAILED) return "tool_failed";
  return "provider_failed";
};

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

// Retain the activity trace only when turn-activity history is enabled, and stop
// at the bound: a runaway loop degrades to a truncated trace, never to unbounded
// memory. Repeated events for one activityId are kept as-is — the client's fold
// dedupes by id exactly like it does on the live stream.
const appendActivityEvent = (
  accumulator: ProtocolEventAccumulator,
  event: SidechatStreamEvent,
): readonly ActivityEvent[] => {
  if (!accumulator.collectActivity || event.type !== SIDECHAT_EVENT_TYPES.ACTIVITY) {
    return accumulator.activityEvents;
  }
  if (accumulator.activityEvents.length >= MAX_ACCUMULATED_ACTIVITY_EVENTS) {
    return accumulator.activityEvents;
  }
  return [...accumulator.activityEvents, event];
};

const isCompletedEvent = (event: SidechatStreamEvent): event is CompletedEvent =>
  event.type === SIDECHAT_EVENT_TYPES.COMPLETED;

const invalidRuntimeSequence = (message: string): PartnerAiCoreError =>
  new PartnerAiCoreError(
    PARTNER_AI_CORE_ERROR_CODES.INVALID_RUNTIME_SEQUENCE,
    message,
    PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.MALFORMED_STREAM,
  );
