import {
  parseChatStreamRequest,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";

import { ChatClientError } from "./errors.js";
import { decodeChunkedSseStream, type StreamChunk } from "./sse-reader.js";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type RetryPolicy = {
  readonly attempts: number;
  readonly statuses?: readonly number[];
};

export type ChatClientOptions = {
  readonly baseUrl: string;
  readonly streamPath?: string;
  readonly fetch?: FetchLike;
  readonly retry?: RetryPolicy;
};

export type StreamChatOptions = {
  readonly signal?: AbortSignal;
  readonly retry?: RetryPolicy;
};

export type StreamChatResult = {
  readonly events: AsyncIterable<SidechatStreamEvent>;
  readonly attempt: number;
};

export type ChatClient = {
  readonly streamChat: (
    request: ChatStreamRequest,
    options?: StreamChatOptions,
  ) => Promise<StreamChatResult>;
};

const DEFAULT_STREAM_PATH = "/chat/stream";
const DEFAULT_RETRY_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export const createChatClient = (options: ChatClientOptions): ChatClient => {
  const transport = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!transport) {
    throw new ChatClientError("network_error", "Fetch is not available");
  }

  return {
    streamChat: (request, streamOptions = {}) =>
      streamChatWithFetch(request, options, streamOptions, transport),
  };
};

const streamChatWithFetch = async (
  request: ChatStreamRequest,
  clientOptions: ChatClientOptions,
  streamOptions: StreamChatOptions,
  transport: FetchLike,
): Promise<StreamChatResult> => {
  const parsedRequest = parseChatStreamRequest(request);
  const retry = streamOptions.retry ?? clientOptions.retry;
  const maxAttempts = Math.max(1, retry?.attempts ?? 1);
  let attempt = 1;

  while (attempt <= maxAttempts) {
    assertNotAborted(streamOptions.signal);

    try {
      const response = await transport(
        buildUrl(clientOptions),
        buildRequestInit(parsedRequest, streamOptions.signal),
      );

      if (!response.ok) {
        throw createHttpError(response.status, attempt);
      }

      if (!response.body) {
        throw new ChatClientError(
          "network_error",
          "Streaming response body is missing",
          { attempt },
        );
      }

      return {
        events: decodeChunkedSseStream(readResponseBody(response.body), {
          ...(streamOptions.signal ? { signal: streamOptions.signal } : {}),
        }),
        attempt,
      };
    } catch (cause) {
      assertNotAborted(streamOptions.signal);
      const error = toClientError(cause, attempt);
      if (!shouldRetry(error, retry, attempt, maxAttempts)) throw error;
      attempt += 1;
    }
  }

  throw new ChatClientError("network_error", "Retry loop exhausted", {
    attempt: maxAttempts,
  });
};

const buildUrl = (options: ChatClientOptions): string => {
  const base = options.baseUrl.endsWith("/")
    ? options.baseUrl
    : `${options.baseUrl}/`;
  const path = (options.streamPath ?? DEFAULT_STREAM_PATH).replace(/^\//u, "");
  return new URL(path, base).toString();
};

const buildRequestInit = (
  request: ChatStreamRequest,
  signal: AbortSignal | undefined,
): RequestInit => ({
  method: "POST",
  headers: {
    accept: "text/event-stream",
    "content-type": "application/json",
  },
  body: JSON.stringify(request),
  ...(signal ? { signal } : {}),
});

const readResponseBody = async function* (
  body: ReadableStream<Uint8Array>,
): AsyncIterable<StreamChunk> {
  const reader = body.getReader();
  try {
    while (true) {
      const read = await reader.read();
      if (read.done) return;
      yield read.value;
    }
  } finally {
    reader.releaseLock();
  }
};

const createHttpError = (status: number, attempt: number): ChatClientError =>
  new ChatClientError("http_error", `Chat stream request failed: ${status}`, {
    status,
    attempt,
  });

const toClientError = (cause: unknown, attempt: number): ChatClientError => {
  if (cause instanceof ChatClientError) return cause;
  if (isAbortLikeError(cause)) {
    return new ChatClientError("aborted", "Chat stream was aborted", {
      cause,
      attempt,
    });
  }
  return new ChatClientError("network_error", "Chat stream request failed", {
    cause,
    attempt,
  });
};

const isAbortLikeError = (cause: unknown): boolean =>
  cause instanceof DOMException && cause.name === "AbortError";

const shouldRetry = (
  error: ChatClientError,
  retry: RetryPolicy | undefined,
  attempt: number,
  maxAttempts: number,
): boolean => {
  if (attempt >= maxAttempts) return false;
  if (!retry) return false;
  if (error.code !== "http_error" || error.status === undefined) return false;

  const statuses = retry.statuses
    ? new Set(retry.statuses)
    : DEFAULT_RETRY_STATUS;
  return statuses.has(error.status);
};

const assertNotAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw new ChatClientError("aborted", "Chat stream was aborted", {
      cause: signal.reason,
    });
  }
};
