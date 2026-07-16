import type { WorkflowChatClient } from "@side-chat/side-chat-widget";

import type { WidgetHarnessConfig } from "#config/modes";

export const createWorkflowServiceClient = (config: WidgetHarnessConfig): WorkflowChatClient => ({
  baseUrl: resolveLocalApiBaseUrl(config.apiBaseUrl),
  getRequestConfig: () => ({
    headers: { authorization: `Bearer ${config.authToken}` },
  }),
});

export const resolveLocalApiBaseUrl = (baseUrl: string): string => {
  if (!baseUrl.startsWith("/")) return baseUrl;

  const origin = typeof window === "undefined" ? "http://127.0.0.1:5173" : window.location.origin;
  return new URL(baseUrl, origin).toString();
};
