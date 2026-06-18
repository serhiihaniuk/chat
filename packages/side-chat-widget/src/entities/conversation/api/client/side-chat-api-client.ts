import { parseChatStreamRequest, type ChatStreamRequest } from "@side-chat/chat-protocol";
import { omitUndefinedProperties } from "@side-chat/shared";

import { SideChatApiError } from "../http/side-chat-api-error.js";
import { assertNotAborted, buildPathUrl, createHttpError } from "../http/side-chat-http-helpers.js";
import {
  listConversationsWithFetch,
  listModelsWithFetch,
  readHistoryWithFetch,
  readUsageWithFetch,
  resetHistoryWithFetch,
} from "../http/side-chat-resource-client.js";
import { decodeChunkedSseStream, type StreamChunk } from "../sse/side-chat-sse-reader.js";
import type {
  FetchLike,
  RetryPolicy,
  SideChatApiClient,
  SideChatApiClientOptions,
  StreamChatOptions,
  StreamChatResult,
} from "./side-chat-api-types.js";

export type {
  ConversationSummary,
  FetchLike,
  ListConversationsOptions,
  ListConversationsResult,
  ListModelsOptions,
  ListModelsResult,
  ModelCatalogOption,
  ModelCatalogReasoning,
  ReadHistoryOptions,
  ReadHistoryResult,
  ReadUsageOptions,
  RetryPolicy,
  ResetHistoryOptions,
  ResetHistoryResult,
  SideChatApiClient,
  SideChatApiClientOptions,
  StreamChatOptions,
  StreamChatResult,
} from "./side-chat-api-types.js";

const DEFAULT_STREAM_PATH = "/chat/stream";
// 409 is intentionally excluded: a Conflict is not safely retryable for a
// turn-creating POST. The streamed turn carries an idempotency-key so the server
// can dedupe when a retryable status (timeout / overload) is replayed.
const DEFAULT_RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_BASE_DELAY_MS = 300;
const RETRY_MAX_DELAY_MS = 5_000;

export const createSideChatApiClient = (options: SideChatApiClientOptions): SideChatApiClient => {
  const transport = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!transport) {
    throw new SideChatApiError("network_error", "Fetch is not available");
  }

  return {
    listModels: (modelOptions = {}) => listModelsWithFetch(options, modelOptions, transport),
    listConversations: (listOptions = {}) =>
      listConversationsWithFetch(options, listOptions, transport),
    readHistory: (conversationId, readOptions = {}) =>
      readHistoryWithFetch(conversationId, options, readOptions, transport),
    readUsage: (usageOptions = {}) => readUsageWithFetch(options, usageOptions, transport),
    resetHistory: (conversationId, resetOptions = {}) =>
      resetHistoryWithFetch(conversationId, options, resetOptions, transport),
    streamChat: (request, streamOptions = {}) =>
      streamChatWithFetch(request, options, streamOptions, transport),
  };
};

const streamChatWithFetch = async (
  request: ChatStreamRequest,
  clientOptions: SideChatApiClientOptions,
  streamOptions: StreamChatOptions,
  transport: FetchLike,
): Promise<StreamChatResult> => {
  const parsedRequest = parseChatStreamRequest(request);
  const retry = streamOptions.retry ?? clientOptions.retry;
  const maxAttempts = Math.max(1, retry?.attempts ?? 1);
  let attempt = 1;

  while (attempt <= maxAttempts) {
    const result = await requestStreamAttempt(
      parsedRequest,
      clientOptions,
      streamOptions,
      transport,
      attempt,
    );
    if (result.ok) return result.value;
    if (!shouldRetry(result.error, retry, attempt, maxAttempts)) throw result.error;
    await delayBeforeRetry(attempt, streamOptions.signal);
    attempt += 1;
  }

  throw new SideChatApiError("network_error", "Retry loop exhausted", {
    attempt: maxAttempts,
  });
};

type StreamAttemptResult =
  | { readonly ok: true; readonly value: StreamChatResult }
  | { readonly ok: false; readonly error: SideChatApiError };

const requestStreamAttempt = async (
  request: ChatStreamRequest,
  clientOptions: SideChatApiClientOptions,
  streamOptions: StreamChatOptions,
  transport: FetchLike,
  attempt: number,
): Promise<StreamAttemptResult> => {
  assertNotAborted(streamOptions.signal);

  try {
    const response = await transport(
      buildUrl(clientOptions),
      buildRequestInit(request, streamOptions.signal),
    );
    return { ok: true, value: streamResultFromResponse(response, streamOptions, attempt) };
  } catch (cause) {
    assertNotAborted(streamOptions.signal);
    return { ok: false, error: toClientError(cause, attempt) };
  }
};

const streamResultFromResponse = (
  response: Response,
  streamOptions: StreamChatOptions,
  attempt: number,
): StreamChatResult => {
  if (!response.ok) throw createHttpError(response.status, attempt);
  if (!response.body) {
    throw new SideChatApiError("network_error", "Streaming response body is missing", {
      attempt,
    });
  }

  return {
    events: decodeChunkedSseStream(
      readResponseBody(response.body),
      streamOptions.signal ? { signal: streamOptions.signal } : undefined,
    ),
    attempt,
  };
};

const buildUrl = (options: SideChatApiClientOptions): string => {
  return buildPathUrl(options.baseUrl, options.streamPath ?? DEFAULT_STREAM_PATH);
};

const buildRequestInit = (
  request: ChatStreamRequest,
  signal: AbortSignal | undefined,
): RequestInit =>
  omitUndefinedProperties({
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
      // Lets the server dedupe a replayed turn so retries never create duplicates.
      "idempotency-key": request.requestId,
    },
    body: JSON.stringify(request),
    signal,
  });

// Exponential backoff with full jitter so a fleet of clients retrying the same
// overloaded server does not resynchronize into a thundering herd.
const delayBeforeRetry = (attempt: number, signal: AbortSignal | undefined): Promise<void> => {
  const ceiling = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  const waitMs = Math.random() * ceiling;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, waitMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(
          new SideChatApiError("aborted", "Chat stream was aborted", {
            cause: signal.reason,
          }),
        );
      },
      { once: true },
    );
  });
};

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

const toClientError = (cause: unknown, attempt: number): SideChatApiError => {
  if (cause instanceof SideChatApiError) return cause;
  if (isAbortLikeError(cause)) {
    return new SideChatApiError("aborted", "Chat stream was aborted", {
      cause,
      attempt,
    });
  }
  return new SideChatApiError("network_error", "Chat stream request failed", {
    cause,
    attempt,
  });
};

const isAbortLikeError = (cause: unknown): boolean =>
  cause instanceof DOMException && cause.name === "AbortError";

const shouldRetry = (
  error: SideChatApiError,
  retry: RetryPolicy | undefined,
  attempt: number,
  maxAttempts: number,
): boolean => {
  if (attempt >= maxAttempts) return false;
  if (!retry) return false;
  if (error.code !== "http_error" || error.status === undefined) return false;

  const statuses = retry.statuses ? new Set(retry.statuses) : DEFAULT_RETRY_STATUS;
  return statuses.has(error.status);
};
