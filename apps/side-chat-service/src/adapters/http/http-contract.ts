export const HTTP_HEADERS = {
  AUTHORIZATION: "authorization",
  REQUEST_ID: "x-request-id",
  RETRY_AFTER: "retry-after",
  WORKFLOW_RUN_ID: "x-workflow-run-id",
} as const;

export const CHAT_HTTP_ROUTES = {
  START: "/api/chat",
  CANCEL: "/api/chat/:runId/cancel",
} as const;

export const QUERY_HTTP_ROUTES = {
  CONVERSATIONS: "/api/conversations",
  MESSAGES: "/api/conversations/:conversationId/messages",
  ACTIVE_TURN: "/api/conversations/:conversationId/active-turn",
  MODELS: "/api/models",
} as const;
