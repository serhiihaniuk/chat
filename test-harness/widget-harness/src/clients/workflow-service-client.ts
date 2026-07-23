import type { WorkflowChatClient } from "@side-chat/side-chat-widget";

import type { WidgetHarnessConfig } from "#config/widget-harness-config";

/** Create the local harness client; its bearer value is a disposable fixture credential. */
export const createWorkflowServiceClient = (config: WidgetHarnessConfig): WorkflowChatClient => ({
  baseUrl: resolveLocalApiBaseUrl(config.apiBaseUrl),
  scopeKey: config.workspaceId,
  getRequestConfig: () => ({
    headers: { authorization: `Bearer ${config.authToken}` },
  }),
});

/** Resolve proxy-relative harness routes while preserving explicitly absolute service URLs. */
export const resolveLocalApiBaseUrl = (baseUrl: string): string => {
  if (!baseUrl.startsWith("/")) return baseUrl;

  const origin = typeof window === "undefined" ? "http://127.0.0.1:5173" : window.location.origin;
  return new URL(baseUrl, origin).toString();
};
