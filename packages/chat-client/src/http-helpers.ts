import { ChatClientError } from "./errors.js";

export const buildPathUrl = (baseUrl: string, rawPath: string): string => {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const path = rawPath.replace(/^\//u, "");
  return new URL(path, base).toString();
};

export const createHttpError = (status: number, attempt: number): ChatClientError =>
  new ChatClientError("http_error", `Chat client request failed: ${status}`, {
    status,
    attempt,
  });

export const assertNotAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw new ChatClientError("aborted", "Chat stream was aborted", {
      cause: signal.reason,
    });
  }
};

export const withSignal = (signal: AbortSignal | undefined): RequestInit =>
  signal ? { signal } : {};
