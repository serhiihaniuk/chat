import type { WidgetHostBridge } from "@side-chat/host-bridge";
import { useEffect, useState, useSyncExternalStore } from "react";

import type {
  WorkflowActiveTurn,
  WorkflowChatHttpError,
  WorkflowConversationClient,
  WorkflowUIMessage,
} from "#entities/workflow-chat";
import type {
  WorkflowApprovalDecisionHandler,
  WorkflowApprovalDecisions,
} from "./approval/workflow-approval.js";
import {
  createWorkflowWidgetChatSessionRegistry,
  WORKFLOW_WIDGET_TRANSPORT,
  WORKFLOW_WIDGET_TURN,
  type WorkflowWidgetChatLifecycle,
  type WorkflowWidgetChatSessionRegistry,
  type WorkflowWidgetTransport,
  type WorkflowWidgetTurn,
} from "./session/workflow-widget-chat-session.js";
import type { WorkflowChatTerminal } from "./terminal/workflow-chat-terminal.js";

export const WORKFLOW_WIDGET_CHAT_STATUS = {
  ERROR: "error",
  IDLE: "idle",
  STREAMING: "streaming",
  SUBMITTED: "submitted",
} as const;

export type WorkflowWidgetChatStatus =
  (typeof WORKFLOW_WIDGET_CHAT_STATUS)[keyof typeof WORKFLOW_WIDGET_CHAT_STATUS];

export const WORKFLOW_WIDGET_CHAT_PHASE = {
  ERROR: "error",
  IDLE: "idle",
  REATTACHING: "reattaching",
  SETTLING: "settling",
  STREAMING: "streaming",
  SUBMITTED: "submitted",
} as const;

export type WorkflowWidgetChatPhase =
  (typeof WORKFLOW_WIDGET_CHAT_PHASE)[keyof typeof WORKFLOW_WIDGET_CHAT_PHASE];

export type { WorkflowChatTerminal } from "./terminal/workflow-chat-terminal.js";

export type {
  WorkflowApprovalDecisionHandler,
  WorkflowApprovalDecisions,
  WorkflowApprovalDecisionState,
} from "./approval/workflow-approval.js";

export {
  createWorkflowWidgetChatSessionRegistry,
  type WorkflowWidgetChatLifecycle,
  type WorkflowWidgetChatSessionRegistry,
} from "./session/workflow-widget-chat-session.js";

const EMPTY_LIFECYCLE: WorkflowWidgetChatLifecycle = {};

export type WorkflowWidgetChat = Readonly<{
  approvalDecisions: WorkflowApprovalDecisions;
  cancelled: boolean;
  decideApproval: WorkflowApprovalDecisionHandler;
  error: WorkflowChatHttpError | undefined;
  messages: readonly WorkflowUIMessage[];
  phase: WorkflowWidgetChatPhase;
  status: WorkflowWidgetChatStatus;
  terminal: WorkflowChatTerminal;
  reconnect: () => Promise<void>;
  retry: () => Promise<void>;
  stop: () => void;
  submitMessage: (text: string) => Promise<void>;
}>;

export type UseWorkflowWidgetChatInput = Readonly<{
  activeTurn?: WorkflowActiveTurn | undefined;
  client: WorkflowConversationClient;
  clientToolCapability?: string | undefined;
  hostBridge?: WidgetHostBridge | undefined;
  includeHostContext?: boolean | undefined;
  initialMessages: readonly WorkflowUIMessage[];
  lifecycle?: WorkflowWidgetChatLifecycle | undefined;
  sessionRegistry?: WorkflowWidgetChatSessionRegistry | undefined;
  /** Opaque identity for the latest coherent state read used as a release barrier. */
  stateObservationId?: string | undefined;
}>;

/** Observe the widget-owned native chat session for one selected conversation. */
export function useWorkflowWidgetChat({
  activeTurn,
  client,
  clientToolCapability,
  hostBridge,
  includeHostContext = false,
  initialMessages,
  lifecycle = EMPTY_LIFECYCLE,
  sessionRegistry,
  stateObservationId,
}: UseWorkflowWidgetChatInput): WorkflowWidgetChat {
  const [localRegistry] = useState(createWorkflowWidgetChatSessionRegistry);
  const registry = sessionRegistry ?? localRegistry;
  const session = registry.getOrCreate({
    activeTurn,
    client,
    clientToolCapability,
    hostBridge,
    includeHostContext,
    initialMessages,
    lifecycle,
    stateObservationId,
  });
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );

  useEffect(() => {
    session.updateContext({
      activeTurn,
      client,
      clientToolCapability,
      hostBridge,
      includeHostContext,
      lifecycle,
      stateObservationId,
    });
    session.observeSnapshot(initialMessages, activeTurn, stateObservationId);
    registry.pruneIdleExcept(client);
  }, [
    activeTurn,
    client,
    clientToolCapability,
    hostBridge,
    includeHostContext,
    initialMessages,
    lifecycle,
    registry,
    session,
    stateObservationId,
  ]);

  useEffect(() => {
    if (sessionRegistry) return undefined;
    return () => localRegistry.disposeAll();
  }, [localRegistry, sessionRegistry]);

  return {
    approvalDecisions: snapshot.approvalDecisions,
    cancelled: snapshot.cancelRequested,
    decideApproval: session.decideApproval,
    error: snapshot.transportError,
    messages: snapshot.messages,
    phase: toWidgetPhase(
      snapshot.activeRunId,
      snapshot.turn,
      snapshot.transport,
      snapshot.streamStarted,
      snapshot.transportError,
    ),
    status: toWidgetStatus(
      snapshot.turn,
      snapshot.transport,
      snapshot.streamStarted,
      snapshot.transportError,
    ),
    terminal: snapshot.terminal,
    reconnect: session.reconnect,
    retry: session.retry,
    stop: session.stop,
    submitMessage: session.submitMessage,
  };
}

const toWidgetStatus = (
  turn: WorkflowWidgetTurn,
  transport: WorkflowWidgetTransport,
  streamStarted: boolean,
  error: WorkflowChatHttpError | undefined,
): WorkflowWidgetChatStatus => {
  if (error || transport === WORKFLOW_WIDGET_TRANSPORT.LOST) {
    return WORKFLOW_WIDGET_CHAT_STATUS.ERROR;
  }
  if (turn !== WORKFLOW_WIDGET_TURN.STREAMING) return WORKFLOW_WIDGET_CHAT_STATUS.IDLE;
  return streamStarted
    ? WORKFLOW_WIDGET_CHAT_STATUS.STREAMING
    : WORKFLOW_WIDGET_CHAT_STATUS.SUBMITTED;
};

function toWidgetPhase(
  activeRunId: string | undefined,
  turn: WorkflowWidgetTurn,
  transport: WorkflowWidgetTransport,
  streamStarted: boolean,
  error: WorkflowChatHttpError | undefined,
): WorkflowWidgetChatPhase {
  if (error || transport === WORKFLOW_WIDGET_TRANSPORT.LOST) {
    return WORKFLOW_WIDGET_CHAT_PHASE.ERROR;
  }
  if (transport === WORKFLOW_WIDGET_TRANSPORT.RECONNECTING) {
    return WORKFLOW_WIDGET_CHAT_PHASE.REATTACHING;
  }
  if (turn === WORKFLOW_WIDGET_TURN.STREAMING) {
    return streamStarted
      ? WORKFLOW_WIDGET_CHAT_PHASE.STREAMING
      : WORKFLOW_WIDGET_CHAT_PHASE.SUBMITTED;
  }
  if (turn === WORKFLOW_WIDGET_TURN.TERMINAL && activeRunId) {
    return WORKFLOW_WIDGET_CHAT_PHASE.SETTLING;
  }
  if (turn === WORKFLOW_WIDGET_TURN.SETTLING) return WORKFLOW_WIDGET_CHAT_PHASE.SETTLING;
  return WORKFLOW_WIDGET_CHAT_PHASE.IDLE;
}
