import { SIDE_CHAT_CLIENT_TOOL_CAPABILITY } from "@side-chat/stream-profile";

export const HTTP_HEADERS = {
  AUTHORIZATION: "authorization",
  CLIENT_TOOL_CAPABILITY: SIDE_CHAT_CLIENT_TOOL_CAPABILITY.HEADER,
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
  ACTIVITY: "/api/activity",
  CONVERSATIONS: "/api/conversations",
  MESSAGES: "/api/conversations/:conversationId/messages",
  STATE: "/api/conversations/:conversationId/state",
  MODELS: "/api/models",
  TOOLS: "/api/tools",
} as const;
