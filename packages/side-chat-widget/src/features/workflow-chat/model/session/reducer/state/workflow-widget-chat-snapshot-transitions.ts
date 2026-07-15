import type { WorkflowUIMessage } from "#entities/workflow-chat";
import { workflowChatTerminalFromHistory } from "../../../terminal/workflow-chat-terminal.js";
import { dedupeWorkflowMessages } from "../workflow-widget-chat-message-projection.js";
import {
  deriveWorkflowWidgetPendingState,
  emptyWorkflowWidgetPendingState,
} from "../workflow-widget-chat-pending.js";
import type {
  WorkflowWidgetChatEvent,
  WorkflowWidgetChatState,
} from "../workflow-widget-chat-reducer.js";
import {
  EMPTY_WORKFLOW_CHAT_TERMINAL,
  WORKFLOW_WIDGET_TRANSPORT,
  WORKFLOW_WIDGET_TURN,
} from "./workflow-widget-chat-state-values.js";

type SnapshotLoadedEvent = Extract<WorkflowWidgetChatEvent, { type: "SnapshotLoaded" }>;
type ActiveSnapshot = NonNullable<SnapshotLoadedEvent["activeTurn"]>;

/** Reconcile one atomic server observation with any still-live attachment epoch. */
export function snapshotLoaded(
  state: WorkflowWidgetChatState,
  event: SnapshotLoadedEvent,
): WorkflowWidgetChatState {
  const runChanged = state.activeRunId !== event.activeTurn?.runId;
  const preserveLiveEpoch = !runChanged && state.activeEpoch !== undefined;
  const messages = dedupeWorkflowMessages(
    preserveLiveEpoch ? [...state.messages, ...event.messages] : event.messages,
  );
  if (event.activeTurn) {
    return activeSnapshotLoaded(
      state,
      event,
      event.activeTurn,
      messages,
      runChanged,
      preserveLiveEpoch,
    );
  }
  return settledSnapshotLoaded(state, event, messages, runChanged);
}

function activeSnapshotLoaded(
  state: WorkflowWidgetChatState,
  event: SnapshotLoadedEvent,
  activeTurn: ActiveSnapshot,
  messages: readonly WorkflowUIMessage[],
  runChanged: boolean,
  preserveLiveEpoch: boolean,
): WorkflowWidgetChatState {
  const { approvalDecisions, handledClientToolCallIds } = snapshotContinuity(state, runChanged);
  const preserveCancellation = !runChanged && state.cancelRequested;
  return {
    ...state,
    activeEpoch: preserveLiveEpoch ? state.activeEpoch : undefined,
    activeRunId: activeTurn.runId,
    approvalDecisions,
    cancelDeliveryRunId: preserveCancellation ? state.cancelDeliveryRunId : undefined,
    cancelRequested: preserveCancellation,
    messages,
    observationId: event.observationId,
    pending: deriveWorkflowWidgetPendingState(
      messages,
      approvalDecisions,
      handledClientToolCallIds,
    ),
    streamStarted: preserveLiveEpoch ? state.streamStarted : false,
    terminal: EMPTY_WORKFLOW_CHAT_TERMINAL,
    transport: preserveLiveEpoch ? state.transport : WORKFLOW_WIDGET_TRANSPORT.RECONNECTING,
    transportError: preserveLiveEpoch ? state.transportError : undefined,
    turn: WORKFLOW_WIDGET_TURN.STREAMING,
  };
}

function settledSnapshotLoaded(
  state: WorkflowWidgetChatState,
  event: SnapshotLoadedEvent,
  messages: readonly WorkflowUIMessage[],
  runChanged: boolean,
): WorkflowWidgetChatState {
  const { approvalDecisions } = snapshotContinuity(state, runChanged);
  const terminal = workflowChatTerminalFromHistory(messages);
  return {
    ...state,
    activeEpoch: undefined,
    activeRunId: undefined,
    approvalDecisions,
    cancelDeliveryRunId: undefined,
    cancelRequested: false,
    messages,
    observationId: event.observationId,
    pending: emptyWorkflowWidgetPendingState(),
    streamStarted: false,
    terminal,
    transport: WORKFLOW_WIDGET_TRANSPORT.LIVE,
    transportError: undefined,
    turn: terminal.kind === "none" ? WORKFLOW_WIDGET_TURN.IDLE : WORKFLOW_WIDGET_TURN.TERMINAL,
  };
}

function snapshotContinuity(
  state: WorkflowWidgetChatState,
  runChanged: boolean,
): Readonly<{
  approvalDecisions: WorkflowWidgetChatState["approvalDecisions"];
  handledClientToolCallIds: ReadonlySet<string>;
}> {
  return {
    approvalDecisions: runChanged ? {} : state.approvalDecisions,
    handledClientToolCallIds: runChanged
      ? new Set<string>()
      : state.pending.handledClientToolCallIds,
  };
}
