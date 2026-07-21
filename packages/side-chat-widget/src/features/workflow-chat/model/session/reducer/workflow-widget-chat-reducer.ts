import type {
  WorkflowActiveTurn,
  WorkflowChatHttpError,
  WorkflowUIMessage,
} from "#entities/workflow-chat";
import type { WorkflowApprovalDecisions } from "../../approval/workflow-approval.js";
import type { WorkflowChatTerminal } from "../../terminal/workflow-chat-terminal.js";
import {
  WORKFLOW_CHAT_EVENT,
  type WorkflowWidgetCancellationEvent,
  type WorkflowWidgetChatEvent,
  type WorkflowWidgetSessionControlEvent,
} from "./state/workflow-widget-chat-events.js";
import {
  addWorkflowWidgetPendingValue,
  emptyWorkflowWidgetPendingState,
  removeWorkflowWidgetPendingValue,
  type WorkflowWidgetPendingState,
} from "./workflow-widget-chat-pending.js";
import {
  attachmentStarted,
  cancelDeliveryFailed,
  cancelDeliveryStarted,
  cancelRequested,
  EMPTY_WORKFLOW_CHAT_TERMINAL,
  epochDisposed,
  optimisticMessageAdded,
  partReceived,
  retryStarted,
  runAccepted,
  snapshotLoaded,
  streamEnded,
  transportDropped,
  transportReconnecting,
  transportRecovered,
  WORKFLOW_WIDGET_TRANSPORT,
  WORKFLOW_WIDGET_TURN,
  type WorkflowWidgetTransport,
  type WorkflowWidgetTurn,
} from "./workflow-widget-chat-transitions.js";

export type { WorkflowWidgetPendingState } from "./workflow-widget-chat-pending.js";
export type { WorkflowWidgetChatEvent } from "./state/workflow-widget-chat-events.js";
export { WORKFLOW_CHAT_EVENT } from "./state/workflow-widget-chat-events.js";
export {
  WORKFLOW_WIDGET_TRANSPORT,
  WORKFLOW_WIDGET_TURN,
} from "./workflow-widget-chat-transitions.js";
export type {
  WorkflowWidgetTransport,
  WorkflowWidgetTurn,
} from "./workflow-widget-chat-transitions.js";

export type WorkflowWidgetAttachmentIdentity = Readonly<{
  epochId: string;
  runId?: string | undefined;
}>;

/** Serializable conversation truth plus reducer-owned idempotency claims. */
export type WorkflowWidgetChatState = Readonly<{
  activeEpoch: WorkflowWidgetAttachmentIdentity | undefined;
  activeRunId: string | undefined;
  approvalDecisions: WorkflowApprovalDecisions;
  cancelDeliveryRunId: string | undefined;
  cancelRequested: boolean;
  messages: readonly WorkflowUIMessage[];
  observationId: string | undefined;
  pending: WorkflowWidgetPendingState;
  streamStarted: boolean;
  terminal: WorkflowChatTerminal;
  transport: WorkflowWidgetTransport;
  transportError: WorkflowChatHttpError | undefined;
  turn: WorkflowWidgetTurn;
}>;

export function createWorkflowWidgetChatState(
  messages: readonly WorkflowUIMessage[],
  activeTurn?: WorkflowActiveTurn,
  observationId?: string,
): WorkflowWidgetChatState {
  return workflowWidgetChatReducer(emptyState(), {
    type: WORKFLOW_CHAT_EVENT.SNAPSHOT_LOADED,
    activeTurn,
    messages,
    observationId,
  });
}

/** The only state transition function for one visible workflow conversation. */
export function workflowWidgetChatReducer(
  state: WorkflowWidgetChatState,
  event: WorkflowWidgetChatEvent,
): WorkflowWidgetChatState {
  if (isSessionControlEvent(event)) return reduceSessionControlEvent(state, event);
  if (isCancellationEvent(event)) return reduceCancellationEvent(state, event);
  switch (event.type) {
    case WORKFLOW_CHAT_EVENT.SNAPSHOT_LOADED:
      return snapshotLoaded(state, event);
    case WORKFLOW_CHAT_EVENT.OPTIMISTIC_MESSAGE_ADDED:
      return optimisticMessageAdded(state, event.message);
    case WORKFLOW_CHAT_EVENT.ATTACHMENT_STARTED:
      return attachmentStarted(state, event);
    case WORKFLOW_CHAT_EVENT.RUN_ACCEPTED:
      return runAccepted(state, event);
    case WORKFLOW_CHAT_EVENT.PART_RECEIVED:
      return partReceived(state, event);
    case WORKFLOW_CHAT_EVENT.STREAM_ENDED:
      return streamEnded(state, event);
    case WORKFLOW_CHAT_EVENT.TRANSPORT_DROPPED:
      return transportDropped(state, event);
    case WORKFLOW_CHAT_EVENT.TRANSPORT_RECONNECTING:
      return transportReconnecting(state, event.epochId);
    case WORKFLOW_CHAT_EVENT.TRANSPORT_RECOVERED:
      return transportRecovered(state, event.epochId);
  }
}

function reduceCancellationEvent(
  state: WorkflowWidgetChatState,
  event: WorkflowWidgetCancellationEvent,
): WorkflowWidgetChatState {
  switch (event.type) {
    case WORKFLOW_CHAT_EVENT.CANCEL_REQUESTED:
      return cancelRequested(state, event.runId);
    case WORKFLOW_CHAT_EVENT.CANCEL_DELIVERY_STARTED:
      return cancelDeliveryStarted(state, event.runId);
    case WORKFLOW_CHAT_EVENT.CANCEL_DELIVERY_FAILED:
      return cancelDeliveryFailed(state, event.runId, event.error);
  }
}

function isCancellationEvent(
  event: WorkflowWidgetChatEvent,
): event is WorkflowWidgetCancellationEvent {
  return (
    event.type === WORKFLOW_CHAT_EVENT.CANCEL_REQUESTED ||
    event.type === WORKFLOW_CHAT_EVENT.CANCEL_DELIVERY_STARTED ||
    event.type === WORKFLOW_CHAT_EVENT.CANCEL_DELIVERY_FAILED
  );
}

function reduceSessionControlEvent(
  state: WorkflowWidgetChatState,
  event: WorkflowWidgetSessionControlEvent,
): WorkflowWidgetChatState {
  switch (event.type) {
    case WORKFLOW_CHAT_EVENT.EPOCH_DISPOSED:
      return epochDisposed(state, event.epochId);
    case WORKFLOW_CHAT_EVENT.RETRY_STARTED:
      return retryStarted(state, event.messages);
    case WORKFLOW_CHAT_EVENT.CLIENT_TOOL_CLAIMED:
      return clientToolClaimed(state, event.toolCallId);
    case WORKFLOW_CHAT_EVENT.CLIENT_TOOL_SETTLED:
      return clientToolSettled(state, event.toolCallId);
    case WORKFLOW_CHAT_EVENT.APPROVAL_REQUEST_STARTED:
      return approvalRequestStarted(state, event.approvalId, event.decision);
    case WORKFLOW_CHAT_EVENT.APPROVAL_DECISION_RECORDED:
      return approvalDecisionRecorded(state, event.approvalId, event.decision);
  }
}

function isSessionControlEvent(
  event: WorkflowWidgetChatEvent,
): event is WorkflowWidgetSessionControlEvent {
  return (
    event.type === WORKFLOW_CHAT_EVENT.EPOCH_DISPOSED ||
    event.type === WORKFLOW_CHAT_EVENT.RETRY_STARTED ||
    event.type === WORKFLOW_CHAT_EVENT.CLIENT_TOOL_CLAIMED ||
    event.type === WORKFLOW_CHAT_EVENT.CLIENT_TOOL_SETTLED ||
    event.type === WORKFLOW_CHAT_EVENT.APPROVAL_REQUEST_STARTED ||
    event.type === WORKFLOW_CHAT_EVENT.APPROVAL_DECISION_RECORDED
  );
}

function emptyState(): WorkflowWidgetChatState {
  return {
    activeEpoch: undefined,
    activeRunId: undefined,
    approvalDecisions: {},
    cancelDeliveryRunId: undefined,
    cancelRequested: false,
    messages: [],
    observationId: undefined,
    pending: emptyWorkflowWidgetPendingState(),
    streamStarted: false,
    terminal: EMPTY_WORKFLOW_CHAT_TERMINAL,
    transport: WORKFLOW_WIDGET_TRANSPORT.LIVE,
    transportError: undefined,
    turn: WORKFLOW_WIDGET_TURN.IDLE,
  };
}

function clientToolClaimed(
  state: WorkflowWidgetChatState,
  toolCallId: string,
): WorkflowWidgetChatState {
  if (
    !state.pending.clientToolCallIds.has(toolCallId) ||
    state.pending.claimedClientToolCallIds.has(toolCallId) ||
    state.pending.handledClientToolCallIds.has(toolCallId)
  ) {
    return state;
  }
  return {
    ...state,
    pending: {
      ...state.pending,
      claimedClientToolCallIds: addWorkflowWidgetPendingValue(
        state.pending.claimedClientToolCallIds,
        toolCallId,
      ),
    },
  };
}

function clientToolSettled(
  state: WorkflowWidgetChatState,
  toolCallId: string,
): WorkflowWidgetChatState {
  return {
    ...state,
    pending: {
      ...state.pending,
      claimedClientToolCallIds: removeWorkflowWidgetPendingValue(
        state.pending.claimedClientToolCallIds,
        toolCallId,
      ),
      clientToolCallIds: removeWorkflowWidgetPendingValue(
        state.pending.clientToolCallIds,
        toolCallId,
      ),
      handledClientToolCallIds: addWorkflowWidgetPendingValue(
        state.pending.handledClientToolCallIds,
        toolCallId,
      ),
    },
  };
}

function approvalRequestStarted(
  state: WorkflowWidgetChatState,
  approvalId: string,
  decision: "approved" | "denied",
): WorkflowWidgetChatState {
  if (
    !state.pending.approvalIds.has(approvalId) ||
    state.pending.approvalRequestsInFlight.has(approvalId)
  ) {
    return state;
  }
  return {
    ...state,
    approvalDecisions: { ...state.approvalDecisions, [approvalId]: decision },
    pending: {
      ...state.pending,
      approvalRequestsInFlight: addWorkflowWidgetPendingValue(
        state.pending.approvalRequestsInFlight,
        approvalId,
      ),
    },
  };
}

function approvalDecisionRecorded(
  state: WorkflowWidgetChatState,
  approvalId: string,
  decision: WorkflowApprovalDecisions[string],
): WorkflowWidgetChatState {
  return {
    ...state,
    approvalDecisions: { ...state.approvalDecisions, [approvalId]: decision },
    pending: {
      ...state.pending,
      approvalIds: removeWorkflowWidgetPendingValue(state.pending.approvalIds, approvalId),
      approvalRequestsInFlight: removeWorkflowWidgetPendingValue(
        state.pending.approvalRequestsInFlight,
        approvalId,
      ),
    },
  };
}
