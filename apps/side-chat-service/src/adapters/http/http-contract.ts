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
