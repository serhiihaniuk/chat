import type { WorkflowChatTerminal } from "../../../terminal/workflow-chat-terminal.js";

export const WORKFLOW_WIDGET_TURN = {
  IDLE: "idle",
  SETTLING: "settling",
  STREAMING: "streaming",
  TERMINAL: "terminal",
} as const;

export type WorkflowWidgetTurn = (typeof WORKFLOW_WIDGET_TURN)[keyof typeof WORKFLOW_WIDGET_TURN];

export const WORKFLOW_WIDGET_TRANSPORT = {
  LIVE: "live",
  LOST: "lost",
  RECONNECTING: "reconnecting",
} as const;

export type WorkflowWidgetTransport =
  (typeof WORKFLOW_WIDGET_TRANSPORT)[keyof typeof WORKFLOW_WIDGET_TRANSPORT];

export const EMPTY_WORKFLOW_CHAT_TERMINAL: WorkflowChatTerminal = { kind: "none" };
