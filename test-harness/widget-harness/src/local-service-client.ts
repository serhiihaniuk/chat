import { createChatClient, type ChatClient, type FetchLike } from "@side-chat/chat-client";

import type { WidgetHarnessConfig } from "./modes.js";

export const createLocalServiceClient = (config: WidgetHarnessConfig): ChatClient =>
  createChatClient({
    baseUrl: resolveLocalApiBaseUrl(config.apiBaseUrl),
    fetch: withLocalAuth(config.authToken, globalThis.fetch.bind(globalThis)),
  });

export const withLocalAuth =
  (authToken: string, fetchLike: FetchLike): FetchLike =>
  (input, init = {}) =>
    fetchLike(input, {
      ...init,
      headers: {
        ...readHeaders(init.headers),
        authorization: `Bearer ${authToken}`,
      },
    });

const readHeaders = (headers: HeadersInit | undefined): Record<string, string> => {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
};

export const resolveLocalApiBaseUrl = (baseUrl: string): string => {
  if (!baseUrl.startsWith("/")) return baseUrl;

  const origin = typeof window === "undefined" ? "http://127.0.0.1:5173" : window.location.origin;
  return new URL(baseUrl, origin).toString();
};
