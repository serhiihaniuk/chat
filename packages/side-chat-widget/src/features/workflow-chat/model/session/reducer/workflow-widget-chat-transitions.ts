import type { WorkflowChatHttpError, WorkflowUIMessage } from "#entities/workflow-chat";
import {
  workflowChatTerminalFromMessage,
  type WorkflowChatTerminal,
} from "../../terminal/workflow-chat-terminal.js";
import {
  dedupeWorkflowMessages,
  upsertWorkflowMessage,
} from "./workflow-widget-chat-message-projection.js";
import {
  deriveWorkflowWidgetPendingState,
  emptyWorkflowWidgetPendingState,
} from "./workflow-widget-chat-pending.js";
import type {
  WorkflowWidgetChatEvent,
  WorkflowWidgetChatState,
} from "./workflow-widget-chat-reducer.js";
import {
  EMPTY_WORKFLOW_CHAT_TERMINAL,
  WORKFLOW_WIDGET_TRANSPORT,
  WORKFLOW_WIDGET_TURN,
  type WorkflowWidgetTurn,
} from "./state/workflow-widget-chat-state-values.js";

export { snapshotLoaded } from "./state/workflow-widget-chat-snapshot-transitions.js";
export {
  EMPTY_WORKFLOW_CHAT_TERMINAL,
  WORKFLOW_WIDGET_TRANSPORT,
  WORKFLOW_WIDGET_TURN,
} from "./state/workflow-widget-chat-state-values.js";
export type {
  WorkflowWidgetTransport,
  WorkflowWidgetTurn,
} from "./state/workflow-widget-chat-state-values.js";

export function optimisticMessageAdded(
  state: WorkflowWidgetChatState,
  message: WorkflowUIMessage,
): WorkflowWidgetChatState {
  const messages = upsertWorkflowMessage(state.messages, message);
  return {
    ...state,
    activeRunId: undefined,
    approvalDecisions: {},
    cancelDeliveryRunId: undefined,
    cancelRequested: false,
    messages,
    pending: emptyWorkflowWidgetPendingState(),
    streamStarted: false,
    terminal: EMPTY_WORKFLOW_CHAT_TERMINAL,
    transport: WORKFLOW_WIDGET_TRANSPORT.LIVE,
    transportError: undefined,
    turn: WORKFLOW_WIDGET_TURN.STREAMING,
  };
}

export function attachmentStarted(
  state: WorkflowWidgetChatState,
  event: Extract<WorkflowWidgetChatEvent, { type: "AttachmentStarted" }>,
): WorkflowWidgetChatState {
  return {
    ...state,
    activeEpoch: { epochId: event.epochId, runId: event.runId },
    streamStarted: false,
    transport: event.reconnecting
      ? WORKFLOW_WIDGET_TRANSPORT.RECONNECTING
      : WORKFLOW_WIDGET_TRANSPORT.LIVE,
    transportError: undefined,
  };
}

export function runAccepted(
  state: WorkflowWidgetChatState,
  event: Extract<WorkflowWidgetChatEvent, { type: "RunAccepted" }>,
): WorkflowWidgetChatState {
  if (!isCurrentEpoch(state, event.epochId)) return state;
  const runChanged = state.activeRunId !== undefined && state.activeRunId !== event.runId;
  const preserveCancellation = !runChanged && state.cancelRequested;
  return {
    ...state,
    activeEpoch: { epochId: event.epochId, runId: event.runId },
    activeRunId: event.runId,
    approvalDecisions: runChanged ? {} : state.approvalDecisions,
    cancelDeliveryRunId: preserveCancellation ? state.cancelDeliveryRunId : undefined,
    cancelRequested: preserveCancellation,
    pending: runChanged ? emptyWorkflowWidgetPendingState() : state.pending,
    terminal: EMPTY_WORKFLOW_CHAT_TERMINAL,
    transport: WORKFLOW_WIDGET_TRANSPORT.LIVE,
    transportError: undefined,
    turn: WORKFLOW_WIDGET_TURN.STREAMING,
  };
}

export function partReceived(
  state: WorkflowWidgetChatState,
  event: Extract<WorkflowWidgetChatEvent, { type: "PartReceived" }>,
): WorkflowWidgetChatState {
  if (!isCurrentEpoch(state, event.epochId) || state.terminal.kind !== "none") return state;
  const messages = upsertWorkflowMessage(state.messages, event.message);
  const terminal = workflowChatTerminalFromMessage(event.message) ?? EMPTY_WORKFLOW_CHAT_TERMINAL;
  return {
    ...state,
    cancelDeliveryRunId: terminal.kind === "none" ? state.cancelDeliveryRunId : undefined,
    cancelRequested: terminal.kind === "none" ? state.cancelRequested : false,
    messages,
    pending: deriveWorkflowWidgetPendingState(
      messages,
      state.approvalDecisions,
      state.pending.handledClientToolCallIds,
      state.pending,
    ),
    streamStarted: true,
    terminal,
    transport: WORKFLOW_WIDGET_TRANSPORT.LIVE,
    transportError: undefined,
    turn: terminal.kind === "none" ? WORKFLOW_WIDGET_TURN.STREAMING : WORKFLOW_WIDGET_TURN.TERMINAL,
  };
}

export function streamEnded(
  state: WorkflowWidgetChatState,
  event: Extract<WorkflowWidgetChatEvent, { type: "StreamEnded" }>,
): WorkflowWidgetChatState {
  if (!isCurrentEpoch(state, event.epochId)) return state;
  const terminal = terminalFromServerEnd(state, event);
  const hasPending = state.pending.approvalIds.size > 0 || state.pending.clientToolCallIds.size > 0;
  return {
    ...state,
    cancelDeliveryRunId: terminal.kind === "none" ? state.cancelDeliveryRunId : undefined,
    cancelRequested: terminal.kind === "none" ? state.cancelRequested : false,
    streamStarted: false,
    terminal,
    turn: turnAfterStreamEnd(terminal, hasPending),
  };
}

export function transportDropped(
  state: WorkflowWidgetChatState,
  event: Extract<WorkflowWidgetChatEvent, { type: "TransportDropped" }>,
): WorkflowWidgetChatState {
  if (!isCurrentEpoch(state, event.epochId) || state.terminal.kind !== "none") return state;
  return {
    ...state,
    streamStarted: false,
    transport: WORKFLOW_WIDGET_TRANSPORT.LOST,
    transportError: event.error,
  };
}

export function transportRecovered(
  state: WorkflowWidgetChatState,
  epochId: string,
): WorkflowWidgetChatState {
  if (!isCurrentEpoch(state, epochId) || state.terminal.kind !== "none") return state;
  return {
    ...state,
    transport: WORKFLOW_WIDGET_TRANSPORT.LIVE,
    transportError: undefined,
  };
}

export function cancelRequested(
  state: WorkflowWidgetChatState,
  runId: string | undefined,
): WorkflowWidgetChatState {
  if (!state.activeEpoch || state.terminal.kind !== "none") return state;
  if (runId !== undefined && state.activeRunId !== undefined && state.activeRunId !== runId) {
    return state;
  }
  return {
    ...state,
    cancelRequested: true,
  };
}

export function cancelDeliveryStarted(
  state: WorkflowWidgetChatState,
  runId: string,
): WorkflowWidgetChatState {
  if (!state.cancelRequested || state.activeRunId !== runId || state.terminal.kind !== "none") {
    return state;
  }
  return { ...state, cancelDeliveryRunId: runId, transportError: undefined };
}

export function cancelDeliveryFailed(
  state: WorkflowWidgetChatState,
  runId: string,
  error: WorkflowChatHttpError,
): WorkflowWidgetChatState {
  if (state.cancelDeliveryRunId !== runId || state.terminal.kind !== "none") return state;
  return { ...state, cancelDeliveryRunId: undefined, transportError: error };
}

export function epochDisposed(
  state: WorkflowWidgetChatState,
  epochId: string,
): WorkflowWidgetChatState {
  if (!isCurrentEpoch(state, epochId)) return state;
  return { ...state, activeEpoch: undefined, streamStarted: false };
}

export function retryStarted(
  state: WorkflowWidgetChatState,
  messages: readonly WorkflowUIMessage[],
): WorkflowWidgetChatState {
  return {
    ...state,
    activeRunId: undefined,
    approvalDecisions: {},
    cancelDeliveryRunId: undefined,
    cancelRequested: false,
    messages: dedupeWorkflowMessages(messages),
    pending: emptyWorkflowWidgetPendingState(),
    streamStarted: false,
    terminal: EMPTY_WORKFLOW_CHAT_TERMINAL,
    transport: WORKFLOW_WIDGET_TRANSPORT.LIVE,
    transportError: undefined,
    turn: WORKFLOW_WIDGET_TURN.STREAMING,
  };
}

function turnAfterStreamEnd(
  terminal: WorkflowChatTerminal,
  hasPending: boolean,
): WorkflowWidgetTurn {
  if (terminal.kind !== "none") return WORKFLOW_WIDGET_TURN.TERMINAL;
  return hasPending ? WORKFLOW_WIDGET_TURN.STREAMING : WORKFLOW_WIDGET_TURN.SETTLING;
}

function terminalFromServerEnd(
  state: WorkflowWidgetChatState,
  event: Extract<WorkflowWidgetChatEvent, { type: "StreamEnded" }>,
): WorkflowChatTerminal {
  if (state.terminal.kind !== "none") return state.terminal;
  const base = lastAssistantTerminalBase(state.messages);
  if (event.serverAborted) return { kind: "cancelled", ...base };
  if (event.finishReason === "content-filter") return { kind: "blocked", ...base };
  return EMPTY_WORKFLOW_CHAT_TERMINAL;
}

function lastAssistantTerminalBase(
  messages: readonly WorkflowUIMessage[],
): Readonly<{ messageId?: string; partCount?: number }> {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return { messageId: message.id, partCount: message.parts.length };
    }
  }
  return {};
}

function isCurrentEpoch(state: WorkflowWidgetChatState, epochId: string): boolean {
  return state.activeEpoch?.epochId === epochId;
}
