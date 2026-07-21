import type { WorkflowChatClient } from "./workflow-chat-client.js";

/** Shared TanStack Query prefix for every workflow-service read owned by the widget. */
export const WORKFLOW_CHAT_QUERY_SCOPE = "workflow-chat";

/** Query identity for one service and authenticated browser scope. */
export const workflowChatQueryScopeKey = (client: WorkflowChatClient) =>
  [WORKFLOW_CHAT_QUERY_SCOPE, normalizeBaseUrl(client.baseUrl), client.scopeKey] as const;

/** Stable React/session identity for one service and authenticated browser scope. */
export const workflowChatScopeIdentity = (client: WorkflowChatClient): string =>
  JSON.stringify(workflowChatQueryScopeKey(client));

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/u, "");
}
