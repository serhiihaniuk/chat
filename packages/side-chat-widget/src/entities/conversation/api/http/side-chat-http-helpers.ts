import { omitUndefinedProperties } from "@side-chat/shared";

import { SideChatApiError } from "./side-chat-api-error.js";

export const buildPathUrl = (baseUrl: string, rawPath: string): string => {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const path = rawPath.replace(/^\//u, "");
  return new URL(path, base).toString();
};

export const createHttpError = (status: number, attempt: number): SideChatApiError =>
  new SideChatApiError("http_error", `Side Chat API request failed: ${status}`, {
    status,
    attempt,
  });

export const assertNotAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw new SideChatApiError("aborted", "Chat stream was aborted", {
      cause: signal.reason,
    });
  }
};

export const withSignal = (signal: AbortSignal | undefined): RequestInit =>
  omitUndefinedProperties({ signal });
