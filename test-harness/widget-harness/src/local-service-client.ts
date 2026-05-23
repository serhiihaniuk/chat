import {
  createChatClient,
  type ChatClient,
  type FetchLike,
} from "../../../packages/chat-client/src/index.js";

import type { WidgetHarnessConfig } from "./modes.js";

export const createLocalServiceClient = (
  config: WidgetHarnessConfig,
): ChatClient =>
  createChatClient({
    baseUrl: config.apiBaseUrl,
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

const readHeaders = (
  headers: HeadersInit | undefined,
): Record<string, string> => {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
};
