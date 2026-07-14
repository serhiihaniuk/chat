export const HTTP_HEADERS = {
  AUTHORIZATION: "authorization",
  REQUEST_ID: "x-request-id",
  RETRY_AFTER: "retry-after",
  WORKFLOW_RUN_ID: "x-workflow-run-id",
  WORKFLOW_STREAM_TAIL_INDEX: "x-workflow-stream-tail-index",
} as const;

export const CHAT_HTTP_ROUTES = {
  START: "/api/chat",
  CANCEL: "/api/chat/:runId/cancel",
  CLIENT_TOOL_OUTPUT: "/api/chat/:runId/tools/:toolCallId/output",
  TOOL_APPROVAL: "/api/chat/:runId/approvals/:approvalId",
  STREAM: "/api/chat/:runId/stream",
} as const;

export const QUERY_HTTP_ROUTES = {
  CAPABILITIES: "/api/capabilities",
  CONVERSATIONS: "/api/conversations",
  MESSAGES: "/api/conversations/:conversationId/messages",
  ACTIVE_TURN: "/api/conversations/:conversationId/active-turn",
  MODELS: "/api/models",
  TOOLS: "/api/tools",
} as const;
