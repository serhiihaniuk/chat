import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { HostCommandActivityEvent, HostCommandResult } from "@side-chat/host-bridge";

import { toErrorMessage } from "#entities/chat";
import {
  applyHostCommandResult,
  closeAssistantMessage,
  projectEventOntoMessages,
} from "./widget-run-projection.js";
import {
  WIDGET_RUN_STATUSES,
  isTerminalRunStatus,
  type WidgetRunState,
  type WidgetRunStatus,
} from "./widget-run-state.js";

/**
 * Every way the run state advances, applied through the pure reducer.
 *
 * `event` is the keystone: ordered protocol events, deduped by sequence. The
 * rest are controller-driven lifecycle edges (reconnect bookkeeping, host-command
 * dispatch, terminal-from-status) that never come down the event stream.
 */
export type WidgetRunAction =
  | { readonly type: "event"; readonly event: SidechatStreamEvent }
  | { readonly type: "identified"; readonly assistantTurnId: string }
  | { readonly type: "reconnect-started" }
  | { readonly type: "reconnect-cleared" }
  | { readonly type: "host-command-dispatched"; readonly activityId: string }
  | {
      readonly type: "host-command-result";
      readonly event: HostCommandActivityEvent;
      readonly result: HostCommandResult;
    }
  | { readonly type: "terminal"; readonly status: WidgetRunStatus; readonly message?: string }
  | { readonly type: "stream-failed"; readonly message: string };

/** Apply one action to the run state. Pure: same input always yields same output. */
export const widgetRunReducer = (
  state: WidgetRunState,
  action: WidgetRunAction,
): WidgetRunState => {
  switch (action.type) {
    case "event":
      return applyEvent(state, action.event);
    case "identified":
      return { ...state, assistantTurnId: action.assistantTurnId };
    case "reconnect-started":
      return applyReconnectStarted(state);
    case "reconnect-cleared":
      return state.status === WIDGET_RUN_STATUSES.RECONNECTING
        ? { ...state, status: WIDGET_RUN_STATUSES.STREAMING }
        : state;
    case "host-command-dispatched":
      return markHostCommandDispatched(state, action.activityId);
    case "host-command-result":
      return {
        ...state,
        messages: applyHostCommandResult(
          state.messages,
          state.localAssistantMessageId,
          action.event,
          action.result,
        ),
      };
    case "terminal":
      return applyTerminal(state, action.status, action.message);
    case "stream-failed":
      return applyStreamFailed(state, action.message);
  }
};

/**
 * Apply one ordered stream event, deduped by sequence.
 *
 * Events at or below `lastSeenSequence` are ignored, so a reconnect that replays
 * already-applied events is idempotent. A terminal event sets the matching
 * terminal status; otherwise the run is streaming.
 */
const applyEvent = (state: WidgetRunState, event: SidechatStreamEvent): WidgetRunState => {
  if (event.type === SIDECHAT_EVENT_TYPES.HISTORY) return state;
  // A terminal status is final: a stray event after completed/failed/cancelled is
  // ignored entirely so it can neither reopen the turn nor append content.
  if (isTerminalRunStatus(state.status)) return state;
  if (event.sequence <= state.lastSeenSequence) return state;

  const advanced: WidgetRunState = {
    ...state,
    lastSeenSequence: event.sequence,
    messages: projectEventOntoMessages(state.messages, state.localAssistantMessageId, event),
  };

  return applyEventRunFields(advanced, event);
};

/** Fold run-level data carried on specific events (conversation id, usage, errors, status). */
const applyEventRunFields = (state: WidgetRunState, event: SidechatStreamEvent): WidgetRunState => {
  switch (event.type) {
    case SIDECHAT_EVENT_TYPES.STARTED:
      return {
        ...state,
        status: streamingStatus(state),
        conversationId: event.conversationId ?? state.conversationId,
      };
    case SIDECHAT_EVENT_TYPES.COMPLETED:
      return { ...state, status: WIDGET_RUN_STATUSES.COMPLETED, usage: event.usage };
    case SIDECHAT_EVENT_TYPES.ERROR:
      return { ...state, status: WIDGET_RUN_STATUSES.FAILED, errorMessage: event.message };
    case SIDECHAT_EVENT_TYPES.BLOCKED:
      return { ...state, status: WIDGET_RUN_STATUSES.FAILED, errorMessage: event.publicMessage };
    case SIDECHAT_EVENT_TYPES.DELTA:
    case SIDECHAT_EVENT_TYPES.ACTIVITY:
    case SIDECHAT_EVENT_TYPES.HISTORY:
      return { ...state, status: streamingStatus(state) };
  }
};

// Non-terminal events move a submitted/reconnecting run to streaming, but never
// override an already-terminal status (a late event after completed is a no-op).
const streamingStatus = (state: WidgetRunState): WidgetRunStatus =>
  isTerminalRunStatus(state.status) ? state.status : WIDGET_RUN_STATUSES.STREAMING;

const applyReconnectStarted = (state: WidgetRunState): WidgetRunState =>
  isTerminalRunStatus(state.status)
    ? state
    : {
        ...state,
        status: WIDGET_RUN_STATUSES.RECONNECTING,
        reconnectAttempt: state.reconnectAttempt + 1,
      };

const markHostCommandDispatched = (state: WidgetRunState, activityId: string): WidgetRunState =>
  state.dispatchedHostCommandIds.includes(activityId)
    ? state
    : { ...state, dispatchedHostCommandIds: [...state.dispatchedHostCommandIds, activityId] };

/**
 * Force a terminal status from a status read or cancel ack (no terminal event).
 *
 * Used when the server reports the turn already finished or cancelled, so the
 * widget renders the terminal state even though the stream carried no terminal.
 */
const applyTerminal = (
  state: WidgetRunState,
  status: WidgetRunStatus,
  message: string | undefined,
): WidgetRunState => {
  if (isTerminalRunStatus(state.status)) return state;
  return {
    ...state,
    status,
    errorMessage: message ?? state.errorMessage,
    messages: closeAssistantMessage(state.messages, state.localAssistantMessageId),
  };
};

// A FATAL transport error (protocol violation, 4xx, exhausted recovery) fails
// the run unless a terminal already landed. Retryable failures never reach this
// action — transport recovery handles them as reconnect-started.
const applyStreamFailed = (state: WidgetRunState, message: string): WidgetRunState => {
  if (isTerminalRunStatus(state.status)) return state;
  return {
    ...state,
    status: WIDGET_RUN_STATUSES.FAILED,
    errorMessage: message,
    messages: closeAssistantMessage(state.messages, state.localAssistantMessageId),
  };
};

/** Normalize an unknown thrown value into a user-facing run error message. */
export const runErrorMessage = (error: unknown): string => toErrorMessage(error);
